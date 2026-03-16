"""
AWS Bedrock Knowledge Base Client
Handles queries to AWS Bedrock Knowledge Base for RAG functionality.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor

import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)

# Thread pool for running sync boto3 calls
_executor = ThreadPoolExecutor(max_workers=4)


class KnowledgeBaseClient:
    """
    Client for querying AWS Bedrock Knowledge Base.
    Supports both retrieve-and-generate and retrieve-only modes.
    """
    
    def __init__(
        self,
        knowledge_base_id: str,
        region: str = "us-west-2",
        model_id: str = "anthropic.claude-3-5-sonnet-20241022-v2:0"
    ):
        """
        Initialize the Knowledge Base client.
        
        Args:
            knowledge_base_id: Bedrock Knowledge Base ID
            region: AWS region
            model_id: Model ID for response generation
        """
        self.knowledge_base_id = knowledge_base_id
        self.region = region
        self.model_id = model_id
        
        # Configure boto3 with timeout settings
        boto_config = Config(
            region_name=region,
            connect_timeout=10,
            read_timeout=30,
            retries={'max_attempts': 2}
        )
        
        # Initialize Bedrock Agent Runtime client
        self.bedrock_agent = boto3.client(
            'bedrock-agent-runtime',
            config=boto_config
        )
        
        logger.info(f"Knowledge Base client initialized: KB={knowledge_base_id}, region={region}")
    
    async def query(
        self,
        question: str,
        max_results: int = 5,
        max_tokens: int = 1024,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """
        Query the knowledge base and generate a response using retrieve-and-generate.
        
        Args:
            question: The user's question
            max_results: Maximum number of retrieval results
            max_tokens: Maximum tokens for response generation
            temperature: Temperature for response generation
            
        Returns:
            Dict with 'success', 'answer', and 'sources'
        """
        try:
            # Run sync boto3 call in thread pool
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                _executor,
                lambda: self.bedrock_agent.retrieve_and_generate(
                    input={'text': question},
                    retrieveAndGenerateConfiguration={
                        'type': 'KNOWLEDGE_BASE',
                        'knowledgeBaseConfiguration': {
                            'knowledgeBaseId': self.knowledge_base_id,
                            'modelArn': f"arn:aws:bedrock:{self.region}::foundation-model/{self.model_id}",
                            'retrievalConfiguration': {
                                'vectorSearchConfiguration': {
                                    'numberOfResults': max_results
                                }
                            },
                            'generationConfiguration': {
                                'inferenceConfig': {
                                    'textInferenceConfig': {
                                        'maxTokens': max_tokens,
                                        'temperature': temperature
                                    }
                                }
                            }
                        }
                    }
                )
            )
            
            # Extract answer
            output = response.get('output', {})
            answer = output.get('text', '')
            
            # Extract citations/sources
            citations = response.get('citations', [])
            sources = []
            for citation in citations:
                for ref in citation.get('retrievedReferences', []):
                    content = ref.get('content', {}).get('text', '')
                    location = ref.get('location', {})
                    sources.append({
                        'content': content[:300] + '...' if len(content) > 300 else content,
                        'location': location
                    })
            
            logger.info(f"Knowledge Base query successful: {len(sources)} sources found")
            
            return {
                'success': True,
                'answer': answer,
                'sources': sources
            }
            
        except Exception as e:
            logger.error(f"Knowledge Base query failed: {e}")
            return {
                'success': False,
                'answer': f"查询知识库失败: {str(e)}",
                'sources': []
            }
    
    async def retrieve(
        self,
        question: str,
        max_results: int = 5
    ) -> Dict[str, Any]:
        """
        Retrieve relevant documents without generating a response.
        Useful for providing context to the main LLM.
        
        Args:
            question: The search query
            max_results: Maximum number of results
            
        Returns:
            Dict with 'success' and 'documents' list
        """
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                _executor,
                lambda: self.bedrock_agent.retrieve(
                    knowledgeBaseId=self.knowledge_base_id,
                    retrievalQuery={'text': question},
                    retrievalConfiguration={
                        'vectorSearchConfiguration': {
                            'numberOfResults': max_results
                        }
                    }
                )
            )
            
            documents = []
            for result in response.get('retrievalResults', []):
                content = result.get('content', {}).get('text', '')
                score = result.get('score', 0)
                documents.append({
                    'content': content,
                    'score': score
                })
            
            logger.info(f"Knowledge Base retrieval successful: {len(documents)} documents found")
            
            return {
                'success': True,
                'documents': documents
            }
            
        except Exception as e:
            logger.error(f"Knowledge Base retrieval failed: {e}")
            return {
                'success': False,
                'documents': []
            }


# Singleton instance for the charger knowledge base
_charger_kb_client: Optional[KnowledgeBaseClient] = None


def get_charger_knowledge_base() -> KnowledgeBaseClient:
    """
    Get or create the charger knowledge base client singleton.
    Uses environment variables for configuration.
    """
    global _charger_kb_client
    
    if _charger_kb_client is None:
        import os
        kb_id = os.environ.get("KNOWLEDGE_BASE_ID", "FHRCYNULOS")
        kb_region = os.environ.get("KNOWLEDGE_BASE_REGION", "us-west-2")
        
        _charger_kb_client = KnowledgeBaseClient(
            knowledge_base_id=kb_id,
            region=kb_region
        )
    
    return _charger_kb_client
