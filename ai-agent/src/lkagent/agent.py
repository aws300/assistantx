"""
Assistant Voice Agent - Dual Mode Support (Realtime + Traditional)
Supports:
- Realtime mode: Nova Sonic speech-to-speech for low-latency conversation
- Traditional mode: STT+LLM+TTS pipeline with full control
- Agent Handoff: Switch between RealtimeAgent and LLMAgent for different tasks
- Tools are dynamically loaded from YAML configuration based on scene.
"""

import asyncio
import json
import logging
import os
import yaml
from pathlib import Path
from typing import List, Optional

from opencc import OpenCC
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    cli,
    function_tool,
    room_io,
)
from livekit.agents.llm import ChatContext, ChatMessage
from livekit.plugins import openai, silero

from lkagent.skills import SkillLoader, ToolGenerator, ActionDispatcher
from lkagent.rag import KnowledgeBaseClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice-agent")

# Load configuration — try /app/configs/config.yaml first (Helm mount), fallback to local
_possible_config_paths = [
    Path("/app/configs/config.yaml"),
    Path(__file__).parent / "config.yaml",
    Path(__file__).parent.parent / "configs" / "config.yaml",
]
config_path = None
for _p in _possible_config_paths:
    if _p.exists():
        config_path = _p
        break
if config_path is None:
    config_path = _possible_config_paths[0]
with open(config_path, "r", encoding="utf-8") as f:
    config = yaml.safe_load(f)
logger.info(f"Loaded configuration from {config_path}")

# Override config with environment variables if present
def get_env_or_config(env_key: str, config_path: list, default=None):
    """Get value from environment variable or config file"""
    env_value = os.environ.get(env_key)
    if env_value is not None:
        return env_value
    
    # Navigate config path
    value = config
    for key in config_path:
        if isinstance(value, dict) and key in value:
            value = value[key]
        else:
            return default
    return value if value is not None else default

# Apply environment overrides for voice_mode and nova_sonic
config["voice_mode"] = get_env_or_config("VOICE_MODE", ["voice_mode"], "realtime")
config["nova_sonic"]["model_version"] = get_env_or_config("NOVA_SONIC_MODEL_VERSION", ["nova_sonic", "model_version"], "nova-sonic-2")
config["nova_sonic"]["voice"] = get_env_or_config("NOVA_SONIC_VOICE", ["nova_sonic", "voice"], "tiffany")
config["nova_sonic"]["region"] = get_env_or_config("NOVA_SONIC_REGION", ["nova_sonic", "region"], "us-east-1")
config["nova_sonic"]["turn_detection"] = get_env_or_config("NOVA_SONIC_TURN_DETECTION", ["nova_sonic", "turn_detection"], "MEDIUM")

# REALTIME_ONLY mode: when true, Nova Sonic handles ALL tasks directly (including Skills/RAG)
realtime_only_env = get_env_or_config("REALTIME_ONLY", ["nova_sonic", "realtime_only"], "true")
config["nova_sonic"]["realtime_only"] = str(realtime_only_env).lower() in ("true", "1", "yes")

# Knowledge Base configuration for RAG (optional)
# Read from config.yaml, returns None if not configured
KB_CONFIG = config.get("knowledge_base", None)
if KB_CONFIG:
    logger.info(f"Knowledge Base configured: id={KB_CONFIG.get('id')}, region={KB_CONFIG.get('region')}")
else:
    logger.info("Knowledge Base not configured, RAG tool will not be available")

# Set LiveKit environment variables from config
os.environ["LIVEKIT_URL"] = config["livekit"]["url"]
os.environ["LIVEKIT_API_KEY"] = config["livekit"]["api_key"]
os.environ["LIVEKIT_API_SECRET"] = config["livekit"]["api_secret"]

# Initialize OpenCC for Traditional to Simplified Chinese conversion
cc = OpenCC('t2s')

# Voice mode from config
VOICE_MODE = config.get("voice_mode", "realtime")
REALTIME_ONLY = config.get("nova_sonic", {}).get("realtime_only", True)
logger.info(f"Voice mode: {VOICE_MODE}, Realtime-only: {REALTIME_ONLY}")

# Scene-specific configurations
SCENE_CONFIGS = {
    "car": {
        "skills_file": "vehicle.yaml",
        "greeting_instruction": "用中文简短地问候用户，告诉他们你是车载智能助手，可以帮助控制车辆功能。保持自然友好的语气。",
        "context_hint": "当用户请求控制车辆功能时（如调节空调、控制车窗、调整座椅等），请使用相应的工具来执行操作。",
    },
    "home": {
        "skills_file": "home.yaml",
        "greeting_instruction": "用中文简短地问候用户，告诉他们你是智能家居助手，可以帮助控制家中的智能设备。保持自然友好的语气。",
        "context_hint": "当用户请求控制智能家居设备时（如调节空调、控制灯光、操作窗帘等），请使用相应的工具来执行操作。",
    },
    "charger": {
        "skills_file": "charger.yaml",
        "greeting_instruction": "用中文简短地问候用户，告诉他们你是充电桩智能助手，可以帮助管理充电相关事务和回答充电问题。保持自然友好的语气。",
        "context_hint": "当用户请求控制充电桩功能时（如开始/停止充电、设置目标电量、查询充电状态等），请使用相应的工具来执行操作。",
    },
}


# ============================================
# Knowledge Base RAG Tool
# ============================================

def create_knowledge_base_tool():
    """
    Create a function tool for searching the knowledge base.
    Uses configuration from config.yaml (knowledge_base section).
    Returns None if knowledge base is not configured.
    """
    
    # Check if knowledge base is configured
    if not KB_CONFIG:
        logger.warning("Knowledge base not configured, skipping RAG tool creation")
        return None
    
    kb_id = KB_CONFIG.get("id")
    kb_region = KB_CONFIG.get("region", "us-west-2")
    kb_description = KB_CONFIG.get("description", "知识库查询")
    
    if not kb_id:
        logger.warning("Knowledge base ID not configured, skipping RAG tool creation")
        return None
    
    # Initialize knowledge base client (lazy initialization)
    kb_client = None
    
    @function_tool()
    async def search_knowledge_base(
        context: RunContext,
        query: str
    ) -> str:
        f"""
        搜索知识库获取相关信息。
        当用户询问以下问题时使用此工具：
        {kb_description}
        
        Args:
            query: 用户的问题或搜索关键词
            
        Returns:
            从知识库检索到的相关答案
        """
        nonlocal kb_client
        
        logger.info(f"Searching knowledge base for: {query}")
        
        try:
            # Lazy initialize the client
            if kb_client is None:
                kb_client = KnowledgeBaseClient(
                    knowledge_base_id=kb_id,
                    region=kb_region
                )
            
            # Query the knowledge base
            result = await kb_client.query(
                question=query,
                max_results=5,
                max_tokens=512,
                temperature=0.3
            )
            
            if result['success'] and result['answer']:
                logger.info(f"Knowledge base query successful, sources: {len(result.get('sources', []))}")
                return result['answer']
            else:
                logger.warning(f"Knowledge base query returned no results")
                return "抱歉，我在知识库中没有找到相关信息。请尝试用其他方式描述您的问题。"
                
        except Exception as e:
            logger.error(f"Knowledge base search failed: {e}")
            return f"抱歉，查询知识库时遇到了问题。请稍后再试。"
    
    # Update the docstring dynamically based on config description
    search_knowledge_base.__doc__ = f"""
搜索知识库获取相关信息。
当用户询问以下问题时使用此工具：
{kb_description}

Args:
    query: 用户的问题或搜索关键词
    
Returns:
    从知识库检索到的相关答案
"""
    
    logger.info(f"Knowledge base tool created: id={kb_id}, description={kb_description[:50]}...")
    return search_knowledge_base


# ============================================
# Traditional Mode Components (STT+LLM+TTS)
# ============================================

class SimplifiedChineseTTS(openai.TTS):
    """TTS wrapper that converts Traditional Chinese to Simplified"""
    
    def synthesize(self, text, *, conn_options=None):
        # Convert Traditional Chinese to Simplified before synthesis
        simplified_text = cc.convert(text)
        return super().synthesize(simplified_text, conn_options=conn_options)


class SimplifiedChineseSTT(openai.STT):
    """Wrapper around OpenAI STT that converts Traditional Chinese to Simplified"""
    
    async def _recognize_impl(self, buffer, *, language, conn_options):
        # Call parent implementation
        result = await super()._recognize_impl(buffer, language=language, conn_options=conn_options)
        
        # Convert Traditional Chinese to Simplified
        if result and result.alternatives:
            for alt in result.alternatives:
                if alt.text:
                    alt.text = cc.convert(alt.text)
        
        return result


# ============================================
# Agent Classes
# ============================================

class LLMAgent(Agent):
    """
    LLM Agent using traditional STT+LLM+TTS pipeline.
    Used for:
    - Complex multi-step tasks
    - Vehicle/device control via Skills
    - RAG queries
    - Precise voice output control
    """
    
    def __init__(
        self,
        tools: Optional[List] = None,
        tools_description: str = "",
        scene: str = "car",
        chat_ctx=None,
        enable_handoff_back: bool = True
    ) -> None:
        scene_config = SCENE_CONFIGS.get(scene, SCENE_CONFIGS["car"])
        
        # IMPORTANT: Set _scene early because _create_handoff_to_realtime_tool needs it
        self._scene = scene
        
        # Build enhanced instructions with tools description
        base_instructions = config["agent"]["instructions"]
        
        if tools_description:
            enhanced_instructions = f"""{base_instructions}

{tools_description}

{scene_config['context_hint']}
执行工具后，用简洁自然的中文告诉用户操作结果。
"""
        else:
            enhanced_instructions = base_instructions
        
        # Add handoff instruction if enabled
        if enable_handoff_back and VOICE_MODE == "realtime":
            enhanced_instructions += """

当你完成了用户请求的任务后，如果用户没有新的复杂指令，请使用 transfer_to_realtime_agent 工具切换回快速对话模式。
"""
        
        agent_tools = list(tools) if tools else []
        
        # Add handoff tool if in realtime mode
        if enable_handoff_back and VOICE_MODE == "realtime":
            agent_tools.append(self._create_handoff_to_realtime_tool())
        
        super().__init__(
            instructions=enhanced_instructions,
            tools=agent_tools,
            chat_ctx=chat_ctx,
        )
        
        self._tools_count = len(agent_tools)
        self._greeting_instruction = scene_config["greeting_instruction"]
        logger.info(f"LLMAgent initialized with {self._tools_count} tools for scene: {scene}")
    
    def _create_handoff_to_realtime_tool(self):
        """Create a tool for handing off back to RealtimeAgent"""
        captured_scene = self._scene
        
        @function_tool()
        async def transfer_to_realtime_agent(context: RunContext):
            """
            切换回实时语音对话模式。
            当用户的复杂任务已完成，没有更多需要处理的技能调用时，使用此工具切换回快速对话模式。
            """
            logger.info("Handing off from LLMAgent to RealtimeAgent")
            # Return tuple: (new_agent, message_for_llm)
            return RealtimeVoiceAgent(scene=captured_scene), "好的，已切换回快速对话模式"
        
        return transfer_to_realtime_agent

    async def on_enter(self):
        """Called when agent enters the session"""
        logger.info(f"LLMAgent entering session with {self._tools_count} tools for scene: {self._scene}")
        # 只在首次进入且没有聊天上下文时播放问候语
        if not self.chat_ctx or len(self.chat_ctx.items) == 0:
            # 使用 generate_reply 兼容 realtime session (Nova Sonic)
            # 这样在 handoff 场景下也能正常工作
            await self.session.generate_reply(
                instructions=self._greeting_instruction
            )


class RealtimeVoiceAgent(Agent):
    """
    Realtime Voice Agent using Nova Sonic speech-to-speech.
    
    Two modes:
    1. REALTIME_ONLY=True: Nova Sonic handles ALL tasks directly, including Skills and RAG
    2. REALTIME_ONLY=False: For complex tasks (skills, RAG), hands off to LLMAgent
    
    Used for:
    - Fast, low-latency conversation
    - Emotional understanding
    - Natural turn-taking
    """
    
    def __init__(
        self,
        scene: str = "car",
        chat_ctx=None,
        tools: Optional[List] = None,
        tools_description: str = "",
    ) -> None:
        scene_config = SCENE_CONFIGS.get(scene, SCENE_CONFIGS["car"])
        
        # Build instructions based on mode
        if REALTIME_ONLY and tools:
            # REALTIME_ONLY mode: Nova Sonic handles everything directly
            instructions = f"""{config["agent"]["instructions"]}

你是一个实时语音助手，可以直接处理所有用户请求。

{tools_description}

{scene_config['context_hint']}
执行工具后，用简洁自然的中文告诉用户操作结果。
"""
            agent_tools = list(tools) if tools else []
            logger.info(f"RealtimeOnlyAgent: Nova Sonic with {len(agent_tools)} tools (no handoff)")
        else:
            # Normal realtime mode: use LLM sub-call for complex tasks
            instructions = f"""{config["agent"]["instructions"]}

你是一个实时语音助手，擅长快速、自然的对话。

当用户需要执行以下操作时，请使用 process_with_llm 工具来处理：
- 控制车辆/设备功能（空调、车窗、座椅、灯光等）
- 查询手册或知识库
- 执行需要多步骤的复杂任务

使用 process_with_llm 时：
- task_description: 简要描述任务类型
- user_request: 用户的原始请求

工具会返回处理结果，你需要将结果自然地告诉用户。
"""
            # Create LLM sub-call tool
            llm_tool = self._create_handoff_to_llm_tool(scene)
            agent_tools = [llm_tool]
            logger.info("RealtimeVoiceAgent: Nova Sonic with LLM sub-call tool")
        
        super().__init__(
            instructions=instructions,
            tools=agent_tools,
            chat_ctx=chat_ctx,
        )
        
        self._scene = scene
        self._greeting_instruction = scene_config["greeting_instruction"]
        self._tools_count = len(agent_tools)
        logger.info(f"RealtimeVoiceAgent initialized for scene: {scene} with {self._tools_count} tools")
    
    def _create_handoff_to_llm_tool(self, scene: str):
        """Create a tool that calls LLM as a sub-process (not handoff)
        
        This approach:
        1. Extracts conversation context from Nova Sonic session
        2. Calls an independent LLM (Claude) via LiveKit's openai.LLM
        3. LLM decides which skill to execute and returns parameters
        4. We execute the skill directly and return result
        
        This avoids the session incompatibility issue with Agent Handoff.
        """
        captured_scene = scene
        
        @function_tool()
        async def process_with_llm(
            context: RunContext,
            task_description: str = "",
            user_request: str = ""
        ) -> str:
            """
            使用高级语言模型处理复杂任务。
            当需要执行以下操作时使用此工具：
            - 控制车辆功能（空调、车窗、座椅、灯光等）
            - 查询车辆手册或知识库
            - 执行需要多步骤的复杂任务
            - 需要更精确推理的场景
            
            Args:
                task_description: 简要描述用户想要完成的任务
                user_request: 用户的原始请求内容
            
            Returns:
                处理结果的文本描述，将由语音助手朗读给用户
            """
            logger.info(f"Processing with LLM: {task_description}, request: {user_request}")
            
            try:
                # Get room for skill dispatch
                room = context.session.room_io.room
                
                # Load skills configuration
                skills_path = Path("/app/skills/devices") / SCENE_CONFIGS[captured_scene]["skills_file"]
                if not skills_path.exists():
                    skills_path = Path(__file__).parent / "skills/devices" / SCENE_CONFIGS[captured_scene]["skills_file"]
                
                skill_loader = SkillLoader(str(skills_path))
                skill_config = await skill_loader.load()
                
                # Build tools description for LLM
                tools_json = []
                for skill in skill_config.skills:
                    tool_schema = {
                        "type": "function",
                        "function": {
                            "name": skill.id.replace('.', '_').replace('-', '_'),
                            "description": f"{skill.name}: {skill.description}",
                            "parameters": {
                                "type": "object",
                                "properties": {},
                                "required": []
                            }
                        }
                    }
                    for param in skill.parameters:
                        tool_schema["function"]["parameters"]["properties"][param.name] = {
                            "type": param.type if param.type in ["string", "integer", "number", "boolean"] else "string",
                            "description": param.description or param.name
                        }
                        if param.options:
                            # Extract enum values
                            enum_values = []
                            for opt in param.options:
                                if isinstance(opt, dict) and 'value' in opt:
                                    enum_values.append(opt['value'])
                                else:
                                    enum_values.append(opt)
                            tool_schema["function"]["parameters"]["properties"][param.name]["enum"] = enum_values
                        if param.required:
                            tool_schema["function"]["parameters"]["required"].append(param.name)
                    tools_json.append(tool_schema)
                
                logger.info(f"Prepared {len(tools_json)} tools for LLM")
                
                # Build prompt
                scene_config = SCENE_CONFIGS.get(captured_scene, SCENE_CONFIGS["car"])
                current_request = user_request or task_description
                
                # Use LLM for tool calling
                llm_provider = _get_llm_provider()

                if llm_provider == "bedrock":
                    # Direct Bedrock via litellm library (uses IRSA credentials)
                    import litellm
                    litellm.set_verbose = False
                    llm_region = config["llm"].get("region", "us-west-2")
                    os.environ.setdefault("AWS_REGION_NAME", llm_region)
                    os.environ.setdefault("AWS_DEFAULT_REGION", llm_region)

                    class _LiteLLMClient:
                        """Wrapper matching OpenAI client.chat.completions.create interface."""
                        class chat:
                            class completions:
                                @staticmethod
                                async def create(**kwargs):
                                    return await litellm.acompletion(**kwargs)
                    client = _LiteLLMClient()
                else:
                    # LiteLLM proxy server
                    import openai as openai_client
                    client = openai_client.AsyncOpenAI(
                        api_key=config["llm"].get("api_key", "not-needed"),
                        base_url=config["llm"].get("base_url", ""),
                    )
                
                # Build messages
                messages = [
                    {
                        "role": "system",
                        "content": f"""{config["agent"]["instructions"]}

你是一个智能助手，需要根据用户请求调用合适的工具来执行操作。
{scene_config['context_hint']}
分析用户请求，选择合适的工具并提供正确的参数。
必须调用工具来执行操作，不要只是描述你会做什么。"""
                    },
                    {"role": "user", "content": current_request}
                ]
                
                logger.info(f"Calling LLM with {len(messages)} messages and {len(tools_json)} tools")
                
                # Call LLM with tools
                response = await client.chat.completions.create(
                    model=config["llm"]["model"],
                    messages=messages,
                    tools=tools_json,
                    tool_choice="auto",
                )
                
                # Extract response
                response_message = response.choices[0].message
                response_text = response_message.content or ""
                tool_calls = response_message.tool_calls or []
                
                logger.info(f"LLM response text: {response_text[:100] if response_text else 'None'}...")
                logger.info(f"LLM tool_calls: {len(tool_calls)} calls")
                
                if tool_calls:
                    # Execute tool calls
                    results = []
                    action_dispatcher = ActionDispatcher(room=room)
                    
                    for tool_call in tool_calls:
                        # OpenAI API format: tool_call.function.name and tool_call.function.arguments
                        tool_name = tool_call.function.name
                        tool_args_str = tool_call.function.arguments
                        
                        try:
                            tool_args = json.loads(tool_args_str) if tool_args_str else {}
                        except json.JSONDecodeError:
                            tool_args = {}
                        
                        logger.info(f"LLM calling tool: {tool_name} with args: {tool_args}")
                        
                        # Find the skill and execute
                        for skill in skill_config.skills:
                            skill_id = skill.id.replace('.', '_').replace('-', '_')
                            if skill_id == tool_name:
                                # Build action payload
                                from lkagent.skills.tool_generator import render_template, render_response, COLOR_MAP
                                
                                # Apply defaults and color mapping
                                final_params = {}
                                for param in skill.parameters:
                                    if param.name in tool_args:
                                        value = tool_args[param.name]
                                        if param.name == 'color' and isinstance(value, str):
                                            value = COLOR_MAP.get(value, value)
                                        final_params[param.name] = value
                                    elif param.default is not None:
                                        final_params[param.name] = param.default
                                
                                payload = render_template(skill.action.payload_template, final_params)
                                action = {
                                    "id": skill.action.id,
                                    "params": payload
                                }
                                
                                logger.info(f"Dispatching action: {action}")
                                
                                try:
                                    dispatch_result = await action_dispatcher.dispatch(action)
                                    response_data = {**final_params}
                                    if isinstance(dispatch_result, dict):
                                        response_data.update(dispatch_result.get('data', {}))
                                    
                                    response_template = skill.responses.get('success', '操作完成')
                                    response = render_response(response_template, response_data)
                                    results.append(response)
                                    logger.info(f"Tool {tool_name} result: {response}")
                                except Exception as e:
                                    logger.error(f"Tool {tool_name} failed: {e}")
                                    results.append(skill.responses.get('error', '操作失败'))
                                break
                    
                    return " ".join(results) if results else "操作完成"
                else:
                    # No tool call, return LLM's text response
                    return response_text if response_text else "任务处理完成"
                
            except Exception as e:
                logger.error(f"LLM sub-call failed: {e}", exc_info=True)
                return f"抱歉，处理任务时遇到了问题"
        
        return process_with_llm

    async def on_enter(self):
        """Called when agent enters the session"""
        logger.info(f"RealtimeVoiceAgent entering session for scene: {self._scene}")
        # 使用 generate_reply 让模型自然生成问候语
        # 这与 Nova Sonic RealtimeModel 兼容，不需要独立的 TTS
        await self.session.generate_reply(
            instructions=self._greeting_instruction
        )


# Legacy VoiceAgent for backward compatibility
VoiceAgent = LLMAgent


# ============================================
# Server and Helper Functions
# ============================================

# Create agent server
server = AgentServer()


def prewarm(proc: JobProcess):
    """Pre-warm function to load VAD model"""
    proc.userdata["vad"] = silero.VAD.load()
    logger.info("Silero VAD loaded")


server.setup_fnc = prewarm


async def handle_text_input(session: AgentSession, text: str):
    """Handle text input from client"""
    logger.info(f"Processing text input: {text}")
    try:
        session.generate_reply(user_input=text)
        logger.info(f"Generated reply for text input: {text}")
    except Exception as e:
        logger.error(f"Error generating reply: {e}", exc_info=True)


def setup_data_listener(room: rtc.Room, session: AgentSession):
    """Set up listener for data channel messages AND chat messages (text input)"""

    # Handler for raw data packets (publishData from frontend)
    def on_data_received(data: rtc.DataPacket):
        try:
            payload = data.data.decode('utf-8')
            message = json.loads(payload)
            logger.info(f"Received data from client: {message}")

            # Handle text input
            if message.get('type') == 'text_input':
                text = message.get('text', '')
                if text:
                    asyncio.create_task(handle_text_input(session, text))
        except Exception as e:
            logger.error(f"Error processing data message: {e}")

    room.on("data_received", on_data_received)
    logger.info("Data channel listener set up for text input")


def setup_audio_toggle_rpc(room: rtc.Room, session: AgentSession):
    """
    Set up RPC handler to toggle audio output (TTS) on/off.
    This allows the frontend to disable TTS when user mutes speaker.
    """
    @room.local_participant.register_rpc_method("setAudioOutput")
    async def on_set_audio_output(data: rtc.RpcInvocationData) -> str:
        try:
            payload = json.loads(data.payload)
            enabled = payload.get("enabled", True)
            
            # Toggle audio output (TTS)
            session.output.set_audio_enabled(enabled)
            
            logger.info(f"Audio output (TTS) {'enabled' if enabled else 'disabled'}")
            return json.dumps({"success": True, "audio_enabled": enabled})
        except Exception as e:
            logger.error(f"Error setting audio output: {e}", exc_info=True)
            return json.dumps({"success": False, "error": str(e)})
    
    logger.info("RPC handler registered for setAudioOutput")


async def load_skills_and_tools(room: rtc.Room, scene: str = "car") -> tuple[List, str]:
    """
    Load skills from YAML configuration based on scene and generate function tools.
    
    Args:
        room: Livekit room for RPC dispatch
        scene: Scene type ("car" or "home")
    
    Returns:
        Tuple of (tools list, tools description string)
    """
    # Get scene-specific configuration
    scene_config = SCENE_CONFIGS.get(scene, SCENE_CONFIGS["car"])
    skills_filename = scene_config["skills_file"]
    
    # Get base path from config
    base_path = config.get("skills", {}).get("base_path", "skills/devices")
    skills_url = config.get("skills", {}).get("url", "")
    
    # Determine skill source
    if skills_url:
        skill_source = skills_url
    else:
        # Try multiple paths to find the skills file
        # 1. /app/skills/devices/ (mounted from ConfigMap in k8s)
        # 2. Relative to script location
        possible_paths = [
            Path("/app") / base_path / skills_filename,
            Path(__file__).parent.parent.parent / base_path / skills_filename,
            Path(__file__).parent / base_path / skills_filename,
        ]
        
        skill_source = None
        for path in possible_paths:
            if path.exists():
                skill_source = path
                break
        
        if not skill_source:
            logger.warning(f"Skills file not found. Tried paths: {possible_paths}")
            return [], ""
    
    logger.info(f"Loading skills from: {skill_source} for scene: {scene}")
    
    try:
        # Initialize action dispatcher with room
        action_dispatcher = ActionDispatcher(room=room)
        
        # Load skill configuration
        skill_loader = SkillLoader(str(skill_source))
        skill_config = await skill_loader.load()
        
        logger.info(f"Loaded {len(skill_config.skills)} skills for {skill_config.device_name}")
        
        # Generate function tools
        tool_generator = ToolGenerator(skill_config, action_dispatcher.dispatch)
        tools = tool_generator.generate_all_tools()
        tools_description = tool_generator.get_tools_description()
        
        logger.info(f"Generated {len(tools)} function tools")
        
        # Add RAG tool if knowledge base is configured
        if KB_CONFIG:
            rag_tool = create_knowledge_base_tool()
            if rag_tool:
                tools.append(rag_tool)
                kb_desc = KB_CONFIG.get("description", "知识库查询")
                tools_description += f"\n\n- search_knowledge_base: 搜索知识库获取相关信息。适用于：{kb_desc}"
                logger.info(f"Added RAG tool, total tools: {len(tools)}")
        
        return tools, tools_description
        
    except Exception as e:
        logger.error(f"Failed to load skills: {e}", exc_info=True)
        return [], ""


# ============================================
# Realtime Mode Setup (Nova Sonic)
# ============================================

def create_realtime_session(ctx: JobContext, scene: str) -> AgentSession:
    """Create AgentSession configured for Nova Sonic realtime mode"""
    from livekit.plugins.aws.experimental.realtime import RealtimeModel
    
    nova_config = config.get("nova_sonic", {})
    model_version = nova_config.get("model_version", "nova-sonic-1")
    voice = nova_config.get("voice", "tiffany")
    region = nova_config.get("region", "us-east-1")
    turn_detection = nova_config.get("turn_detection", "MEDIUM")
    
    logger.info(f"Creating Nova Sonic realtime session: model={model_version}, voice={voice}, region={region}")
    
    # Create RealtimeModel based on version
    if model_version == "nova-sonic-2":
        realtime_model = RealtimeModel.with_nova_sonic_2(
            voice=voice,
            region=region,
            turn_detection=turn_detection,
        )
    else:
        realtime_model = RealtimeModel.with_nova_sonic_1(
            voice=voice,
            region=region,
            turn_detection=turn_detection,
        )
    
    # Create session with realtime model (no separate STT/TTS needed)
    session = AgentSession(
        llm=realtime_model,
        vad=ctx.proc.userdata["vad"],
    )
    
    return session


def _get_llm_provider():
    """Get LLM provider config."""
    llm_cfg = config.get("llm", {})
    return llm_cfg.get("provider", "litellm_proxy")


def _create_llm():
    """Create LLM instance based on provider config.

    provider=bedrock:       Uses litellm locally with IRSA credentials (no proxy).
    provider=litellm_proxy: Routes through an external LiteLLM proxy server.
    """
    llm_cfg = config.get("llm", {})
    provider = llm_cfg.get("provider", "litellm_proxy")
    model = llm_cfg.get("model", "bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0")

    if provider == "bedrock":
        # Direct Bedrock: use livekit openai.LLM with litellm model prefix
        # livekit-plugins-openai recognizes bedrock/ prefix when litellm is installed
        region = llm_cfg.get("region", "us-west-2")
        os.environ.setdefault("AWS_REGION_NAME", region)
        os.environ.setdefault("AWS_DEFAULT_REGION", region)
        logger.info(f"LLM provider: bedrock direct (model={model}, region={region})")
        # openai.LLM with model="bedrock/..." and no base_url
        # litellm (installed as dependency) handles the bedrock/ routing
        return openai.LLM(model=model, api_key="not-needed")
    else:
        base_url = llm_cfg.get("base_url", "")
        api_key = llm_cfg.get("api_key", "not-needed")
        logger.info(f"LLM provider: litellm_proxy (model={model}, base_url={base_url})")
        return openai.LLM(model=model, base_url=base_url, api_key=api_key)


def create_traditional_session(ctx: JobContext) -> AgentSession:
    """Create AgentSession configured for traditional STT+LLM+TTS mode"""
    session = AgentSession(
        # STT - Whisper with Traditional to Simplified conversion
        stt=SimplifiedChineseSTT(
            model=config["stt"]["model"],
            base_url=config["stt"]["base_url"],
            api_key=config["stt"]["api_key"],
            language=config["stt"]["language"],
        ),
        # LLM - provider-aware initialization
        llm=_create_llm(),
        # TTS - CosyVoice
        tts=SimplifiedChineseTTS(
            model=config["tts"]["model"],
            voice=config["tts"]["voice"],
            base_url=config["tts"]["base_url"],
            api_key=config["tts"]["api_key"],
            response_format=config["tts"]["response_format"],
        ),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=config["session"]["preemptive_generation"],
        resume_false_interruption=config["session"]["resume_false_interruption"],
        false_interruption_timeout=config["session"]["false_interruption_timeout"],
    )
    
    return session


# ============================================
# Main Entrypoint
# ============================================

@server.rtc_session(agent_name=config["agent"]["name"])
async def entrypoint(ctx: JobContext):
    """Main entry point for each session"""
    ctx.log_context_fields = {"room": ctx.room.name}
    logger.info(f"New session started for room: {ctx.room.name}")
    
    # Extract scene from agent dispatch metadata
    scene = "car"  # Default scene
    try:
        if hasattr(ctx.job, 'metadata') and ctx.job.metadata:
            metadata = json.loads(ctx.job.metadata)
            scene = metadata.get("scene", "car")
            logger.info(f"Got scene from dispatch metadata: {scene}")
        else:
            logger.info("No dispatch metadata found, using default scene")
    except Exception as e:
        logger.warning(f"Failed to parse metadata, using default scene: {e}")
    
    logger.info(f"Using scene: {scene}, voice_mode: {VOICE_MODE}, realtime_only: {REALTIME_ONLY}")
    
    # Create session based on voice mode
    if VOICE_MODE == "realtime":
        # Realtime mode: Nova Sonic speech-to-speech
        session = create_realtime_session(ctx, scene)
        
        if REALTIME_ONLY:
            # REALTIME_ONLY mode: Nova Sonic handles ALL tasks directly
            # Load skills and tools for RealtimeVoiceAgent
            tools, tools_description = await load_skills_and_tools(ctx.room, scene)
            agent = RealtimeVoiceAgent(
                scene=scene,
                tools=tools,
                tools_description=tools_description
            )
            logger.info(f"Using Nova Sonic REALTIME_ONLY mode with {len(tools)} tools (no handoff)")
        else:
            # Normal realtime mode: handoff to LLMAgent for complex tasks
            agent = RealtimeVoiceAgent(scene=scene)
            logger.info("Using Nova Sonic realtime mode with handoff to LLMAgent for skills")
    else:
        # Traditional mode: STT+LLM+TTS
        session = create_traditional_session(ctx)
        
        # Load skills and generate tools for LLMAgent
        tools, tools_description = await load_skills_and_tools(ctx.room, scene)
        
        # Create LLMAgent with tools (no handoff back since we're in traditional mode)
        agent = LLMAgent(
            tools=tools,
            tools_description=tools_description,
            scene=scene,
            enable_handoff_back=False
        )
        
        logger.info(f"Using traditional mode with {len(tools)} tools")
    
    # Set up data channel listener for text input
    setup_data_listener(ctx.room, session)
    
    # Start the session
    await session.start(
        agent=agent,
        room=ctx.room,
        room_options=room_io.RoomOptions(),
    )
    
    # Set up RPC handler for audio output toggle (must be after session.start)
    setup_audio_toggle_rpc(ctx.room, session)
    
    logger.info(f"Session started in {VOICE_MODE} mode")


if __name__ == "__main__":
    logger.info(f"Starting agent: {config['agent']['name']} in {VOICE_MODE} mode")
    cli.run_app(server)
