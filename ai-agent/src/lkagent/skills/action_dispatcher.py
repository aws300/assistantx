"""
Action Dispatcher Module
Dispatches actions to frontend via Livekit RPC.
"""

import json
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class ActionDispatcher:
    """
    Dispatches actions to the frontend via Livekit RPC.
    """
    
    def __init__(self, room=None, participant_identity: Optional[str] = None):
        """
        Initialize the action dispatcher.
        
        Args:
            room: Livekit room instance
            participant_identity: Target participant identity
        """
        self.room = room
        self.participant_identity = participant_identity
        self._pending_responses: Dict[str, Any] = {}
    
    def set_room(self, room, participant_identity: Optional[str] = None):
        """Set the room and participant for RPC calls"""
        self.room = room
        self.participant_identity = participant_identity
    
    async def dispatch(self, action: Dict[str, Any]) -> Dict[str, Any]:
        """
        Dispatch an action to the frontend.
        
        Args:
            action: Action dict with 'id' and 'params'
            
        Returns:
            Result from frontend execution
        """
        if not self.room:
            logger.warning("No room set, cannot dispatch action")
            return {"success": False, "error": "No room connection"}
        
        try:
            # Find the target participant (first non-agent participant)
            target_identity = self.participant_identity
            if not target_identity:
                for participant in self.room.remote_participants.values():
                    if not participant.identity.startswith('agent'):
                        target_identity = participant.identity
                        break
            
            if not target_identity:
                logger.warning("No target participant found for RPC")
                return {"success": False, "error": "No target participant"}
            
            # Send RPC to frontend
            logger.info(f"Dispatching action to {target_identity}: {action['id']}")
            
            response = await self.room.local_participant.perform_rpc(
                destination_identity=target_identity,
                method="executeAction",
                payload=json.dumps(action),
                response_timeout=10.0
            )
            
            # Parse response
            result = json.loads(response) if response else {"success": True}
            logger.info(f"Action result: {result}")
            return result
            
        except Exception as e:
            logger.error(f"Failed to dispatch action: {e}")
            return {"success": False, "error": str(e)}
    
    async def query_vehicle_state(self, state_key: Optional[str] = None) -> Dict[str, Any]:
        """
        Query vehicle state from frontend.
        
        Args:
            state_key: Optional specific state key to query
            
        Returns:
            Vehicle state dict
        """
        action = {
            "id": "system.getState",
            "params": {"key": state_key} if state_key else {}
        }
        return await self.dispatch(action)
