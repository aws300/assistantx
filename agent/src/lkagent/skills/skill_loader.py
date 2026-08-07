# Copyright 2026 AssistantX Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""
Skill Loader Module
Loads skill configurations from YAML and generates LLM tools dynamically.
"""

import os
import re
import json
import logging
from typing import Any, Dict, List, Optional, Callable
from dataclasses import dataclass, field

import yaml
import aiohttp

logger = logging.getLogger(__name__)


@dataclass
class SkillParameter:
    """Represents a skill parameter"""
    name: str
    type: str
    required: bool = False
    default: Any = None
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    unit: str = ""
    description: str = ""
    options: List[Any] = field(default_factory=list)


@dataclass
class SkillAction:
    """Represents a skill action"""
    id: str
    payload_template: Dict[str, Any]


@dataclass
class Skill:
    """Represents a single skill"""
    id: str
    category: str
    name: str
    description: str
    triggers: List[str]
    parameters: List[SkillParameter]
    action: SkillAction
    responses: Dict[str, str]
    returns: Optional[Dict[str, Any]] = None


@dataclass
class RAGQuery:
    """Represents a RAG query configuration"""
    id: str
    name: str
    description: str
    knowledge_base_id: str
    region: str
    model_id: str
    triggers: List[str]
    examples: List[str]
    responses: Dict[str, str]


@dataclass
class SkillConfig:
    """Complete skill configuration"""
    device_type: str
    device_name: str
    version: str
    language: str
    description: str
    settings: Dict[str, Any]
    categories: List[Dict[str, str]]
    skills: List[Skill]
    rag_queries: List[RAGQuery]


class SkillLoader:
    """
    Loads skill configurations from YAML files.
    Supports dynamic loading from API or local files.
    """
    
    def __init__(self, config_source: str):
        """
        Initialize the skill loader.
        
        Args:
            config_source: URL or file path to skill configuration
        """
        self.config_source = config_source
        self.config: Optional[SkillConfig] = None
        self._raw_config: Dict[str, Any] = {}
    
    async def load(self) -> SkillConfig:
        """Load skill configuration from source"""
        if self.config_source.startswith(('http://', 'https://')):
            await self._load_from_url()
        else:
            self._load_from_file()
        
        self.config = self._parse_config()
        logger.info(f"Loaded {len(self.config.skills)} skills for {self.config.device_name}")
        return self.config
    
    async def _load_from_url(self):
        """Load configuration from URL"""
        async with aiohttp.ClientSession() as session:
            async with session.get(self.config_source) as resp:
                if resp.status != 200:
                    raise Exception(f"Failed to load skills from {self.config_source}: {resp.status}")
                
                content_type = resp.headers.get('Content-Type', '')
                text = await resp.text()
                
                if 'json' in content_type:
                    self._raw_config = json.loads(text)
                else:
                    self._raw_config = yaml.safe_load(text)
    
    def _load_from_file(self):
        """Load configuration from local file"""
        with open(self.config_source, 'r', encoding='utf-8') as f:
            self._raw_config = yaml.safe_load(f)
    
    def _parse_config(self) -> SkillConfig:
        """Parse raw config into structured objects"""
        metadata = self._raw_config.get('metadata', {})
        settings = self._raw_config.get('settings', {})
        categories = self._raw_config.get('categories', [])
        
        # Parse skills
        skills = []
        for skill_data in self._raw_config.get('skills', []):
            skill = self._parse_skill(skill_data)
            skills.append(skill)
        
        # Parse RAG queries
        rag_queries = []
        for rag_data in self._raw_config.get('rag_queries', []):
            rag = self._parse_rag_query(rag_data)
            rag_queries.append(rag)
        
        return SkillConfig(
            device_type=metadata.get('device_type', 'unknown'),
            device_name=metadata.get('device_name', 'Unknown Device'),
            version=metadata.get('version', '1.0.0'),
            language=metadata.get('language', 'zh-CN'),
            description=metadata.get('description', ''),
            settings=settings,
            categories=categories,
            skills=skills,
            rag_queries=rag_queries
        )
    
    def _parse_skill(self, data: Dict[str, Any]) -> Skill:
        """Parse a single skill from dict"""
        parameters = []
        for param_data in data.get('parameters', []):
            param = SkillParameter(
                name=param_data.get('name', ''),
                type=param_data.get('type', 'string'),
                required=param_data.get('required', False),
                default=param_data.get('default'),
                min_val=param_data.get('min'),
                max_val=param_data.get('max'),
                unit=param_data.get('unit', ''),
                description=param_data.get('description', ''),
                options=param_data.get('options', [])
            )
            parameters.append(param)
        
        action_data = data.get('action', {})
        action = SkillAction(
            id=action_data.get('id', ''),
            payload_template=action_data.get('payload_template', {})
        )
        
        return Skill(
            id=data.get('id', ''),
            category=data.get('category', ''),
            name=data.get('name', ''),
            description=data.get('description', ''),
            triggers=data.get('triggers', []),
            parameters=parameters,
            action=action,
            responses=data.get('responses', {}),
            returns=data.get('returns')
        )
    
    def _parse_rag_query(self, data: Dict[str, Any]) -> RAGQuery:
        """Parse a RAG query from dict"""
        return RAGQuery(
            id=data.get('id', ''),
            name=data.get('name', ''),
            description=data.get('description', ''),
            knowledge_base_id=data.get('knowledge_base_id', ''),
            region=data.get('region', 'us-west-2'),
            model_id=data.get('model_id', ''),
            triggers=data.get('triggers', []),
            examples=data.get('examples', []),
            responses=data.get('responses', {})
        )
    
    def get_skill_by_id(self, skill_id: str) -> Optional[Skill]:
        """Get a skill by its ID"""
        if not self.config:
            return None
        for skill in self.config.skills:
            if skill.id == skill_id:
                return skill
        return None
    
    def get_skills_by_category(self, category: str) -> List[Skill]:
        """Get all skills in a category"""
        if not self.config:
            return []
        return [s for s in self.config.skills if s.category == category]
    
    def get_all_skill_descriptions(self) -> str:
        """Get formatted descriptions of all skills for LLM context"""
        if not self.config:
            return ""
        
        lines = [f"# {self.config.device_name} 可用技能\n"]
        
        for category in self.config.categories:
            cat_id = category.get('id', '')
            cat_name = category.get('name', '')
            skills = self.get_skills_by_category(cat_id)
            
            if skills:
                lines.append(f"\n## {cat_name}")
                for skill in skills:
                    lines.append(f"- **{skill.name}**: {skill.description}")
                    if skill.triggers:
                        lines.append(f"  示例: {skill.triggers[0]}")
        
        return "\n".join(lines)
