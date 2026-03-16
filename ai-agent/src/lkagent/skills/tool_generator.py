"""
Tool Generator Module
Generates Livekit function tools from YAML skill configurations.
Uses raw_schema approach for dynamic tool creation as per Livekit docs.
"""

import json
import logging
from typing import Any, Callable, Dict, List, Optional

from livekit.agents import function_tool, RunContext

from .skill_loader import Skill, SkillConfig, SkillParameter

logger = logging.getLogger(__name__)


def python_type_to_json_schema_type(py_type: str) -> str:
    """Convert Python type hint to JSON Schema type."""
    type_map = {
        'int': 'integer',
        'float': 'number',
        'str': 'string',
        'bool': 'boolean',
        'list': 'array',
        'dict': 'object',
        'string': 'string',
        'number': 'number',
        'integer': 'integer',
        'boolean': 'boolean',
    }
    return type_map.get(py_type.lower(), 'string')


def build_parameter_schema(param: SkillParameter) -> Dict[str, Any]:
    """Build JSON schema for a single parameter."""
    schema: Dict[str, Any] = {
        'type': python_type_to_json_schema_type(param.type),
        'description': param.description or f"Parameter: {param.name}"
    }
    
    # Add enum if options are provided
    # Handle both simple options (["a", "b"]) and complex options ([{value: "a", aliases: ["x"]}])
    if param.options:
        enum_values = []
        for opt in param.options:
            if isinstance(opt, dict) and 'value' in opt:
                # Complex option format: extract value
                enum_values.append(opt['value'])
            else:
                # Simple option format: use as-is
                enum_values.append(opt)
        schema['enum'] = enum_values
    
    # Add range constraints for numeric types
    if param.min_val is not None:
        schema['minimum'] = param.min_val
    if param.max_val is not None:
        schema['maximum'] = param.max_val
    
    # Add default value if present
    if param.default is not None:
        schema['default'] = param.default
    
    return schema


def build_raw_schema(skill: Skill) -> Dict[str, Any]:
    """
    Build a raw function calling schema for a skill.
    This follows the OpenAI function calling schema format.
    """
    # Build properties for each parameter
    properties = {}
    required = []
    
    for param in skill.parameters:
        properties[param.name] = build_parameter_schema(param)
        if param.required:
            required.append(param.name)
    
    # Build the complete schema
    schema = {
        "type": "function",
        "name": skill.id.replace('.', '_').replace('-', '_'),
        "description": f"{skill.name}: {skill.description}",
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False
        }
    }
    
    return schema


def render_template(template: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    """Render a payload template with parameter values."""
    result = {}
    for key, value in template.items():
        if isinstance(value, str):
            rendered = value
            for param_name, param_value in params.items():
                placeholder = f"${{{param_name}}}"
                if placeholder in rendered:
                    rendered = rendered.replace(placeholder, str(param_value))
            result[key] = rendered
        elif isinstance(value, dict):
            result[key] = render_template(value, params)
        else:
            result[key] = value
    return result


def render_response(template: str, data: Dict[str, Any]) -> str:
    """Render a response template with data values."""
    result = template
    for key, value in data.items():
        placeholder = f"${{{key}}}"
        if placeholder in result:
            result = result.replace(placeholder, str(value))
    return result


# Color name mapping for ambient light
COLOR_MAP = {
    "蓝色": "#3B82F6", "蓝": "#3B82F6", "blue": "#3B82F6",
    "红色": "#EF4444", "红": "#EF4444", "red": "#EF4444",
    "绿色": "#22C55E", "绿": "#22C55E", "green": "#22C55E",
    "橙色": "#F97316", "橙": "#F97316", "orange": "#F97316",
    "紫色": "#A855F7", "紫": "#A855F7", "purple": "#A855F7",
    "粉色": "#EC4899", "粉": "#EC4899", "pink": "#EC4899",
    "白色": "#FFFFFF", "白": "#FFFFFF", "white": "#FFFFFF",
    "黄色": "#FCD34D", "黄": "#FCD34D", "yellow": "#FCD34D",
}


class ToolGenerator:
    """
    Generates Livekit function tools from skill configurations.
    Uses raw_schema approach for proper dynamic tool creation.
    """
    
    def __init__(self, config: SkillConfig, action_dispatcher: Callable):
        self.config = config
        self.action_dispatcher = action_dispatcher
        self._tools: List[Callable] = []
    
    def _create_tool_handler(self, skill: Skill):
        """
        Create a tool handler function for a skill.
        The handler receives raw_arguments dict and RunContext.
        """
        # Capture skill and dispatcher in closure
        captured_skill = skill
        captured_dispatcher = self.action_dispatcher
        
        async def tool_handler(
            raw_arguments: Dict[str, Any],
            context: RunContext
        ) -> str:
            """Handler function that processes the tool call."""
            logger.info(f"Tool {captured_skill.id} called with args: {raw_arguments}")
            
            # Apply default values for missing parameters
            final_params = {}
            for param in captured_skill.parameters:
                if param.name in raw_arguments:
                    value = raw_arguments[param.name]
                    
                    # Handle case where LLM returns complex option object instead of simple value
                    # e.g., {'value': 'bedroom', 'aliases': ['卧室']} -> 'bedroom'
                    if isinstance(value, dict) and 'value' in value:
                        value = value['value']
                    # Handle case where value is a string representation of dict
                    elif isinstance(value, str) and value.startswith('{') and 'value' in value:
                        try:
                            # Try to parse as Python dict literal
                            import ast
                            parsed = ast.literal_eval(value.replace("'", '"').replace('"', "'"))
                            if isinstance(parsed, dict) and 'value' in parsed:
                                value = parsed['value']
                        except:
                            pass
                    
                    # Handle color mapping for ambient light
                    if param.name == 'color' and isinstance(value, str):
                        value = COLOR_MAP.get(value, value)
                    final_params[param.name] = value
                elif param.default is not None:
                    final_params[param.name] = param.default
            
            # Build action payload
            payload = render_template(captured_skill.action.payload_template, final_params)
            action = {
                "id": captured_skill.action.id,
                "params": payload
            }
            
            logger.info(f"Dispatching action: {action}")
            
            try:
                # Dispatch to frontend via RPC
                result = await captured_dispatcher(action)
                
                # Build response
                response_data = {**final_params}
                if isinstance(result, dict):
                    response_data.update(result.get('data', {}))
                
                response_template = captured_skill.responses.get('success', '操作完成')
                response = render_response(response_template, response_data)
                
                logger.info(f"Tool {captured_skill.id} response: {response}")
                return response
                
            except Exception as e:
                logger.error(f"Tool {captured_skill.id} execution failed: {e}")
                return captured_skill.responses.get('error', '操作失败，请重试')
        
        return tool_handler
    
    def _create_tool(self, skill: Skill) -> Callable:
        """
        Create a single function tool from a skill definition.
        Uses raw_schema for dynamic schema definition.
        """
        # Build the raw schema
        raw_schema = build_raw_schema(skill)
        
        # Create the handler
        handler = self._create_tool_handler(skill)
        
        # Create the tool using function_tool with raw_schema
        tool = function_tool(handler, raw_schema=raw_schema)
        
        logger.info(f"Created tool: {raw_schema['name']} - {skill.description}")
        
        return tool
    
    def generate_all_tools(self) -> List[Callable]:
        """Generate all tools from skill configuration."""
        self._tools = []
        
        for skill in self.config.skills:
            try:
                tool = self._create_tool(skill)
                self._tools.append(tool)
            except Exception as e:
                logger.error(f"Failed to create tool for skill {skill.id}: {e}")
        
        logger.info(f"Generated {len(self._tools)} tools from {len(self.config.skills)} skills")
        
        return self._tools
    
    def get_tools_description(self) -> str:
        """Get formatted description of all tools for LLM system prompt"""
        lines = [f"# {self.config.device_name} 可用控制功能\n"]
        
        categories = {}
        for skill in self.config.skills:
            cat = skill.category
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(skill)
        
        for cat_info in self.config.categories:
            cat_id = cat_info.get('id', '')
            cat_name = cat_info.get('name', '')
            if cat_id in categories:
                lines.append(f"\n## {cat_name}")
                for skill in categories[cat_id]:
                    lines.append(f"- {skill.name}: {skill.description}")
        
        return "\n".join(lines)


def create_vehicle_tools(
    config: SkillConfig,
    action_dispatcher: Callable
) -> tuple[List[Callable], ToolGenerator]:
    """Create all vehicle control tools."""
    generator = ToolGenerator(config, action_dispatcher)
    tools = generator.generate_all_tools()
    return tools, generator
