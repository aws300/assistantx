#!/bin/bash
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
# cfn-monitor.sh — watch a CloudFormation stack until it settles
#
# Usage:
#   scripts/cfn-monitor.sh [--stack NAME|ARN] [--region REGION] [--interval SECONDS] [--status-file PATH]
#
# Every --interval seconds (default 300, capped at 600) it prints the stack
# status and every new stack event, so a long EKS deployment leaves a readable
# timeline. While the stack is deleting or rolling back it also removes
# detached Lambda VPC ENIs left in the stack's VPC by already-deleted functions:
# they otherwise hold the subnets and security groups for 20-40 minutes and can
# leave the stack in DELETE_FAILED.
#
# Exit codes: 0 = CREATE_COMPLETE / UPDATE_COMPLETE, 1 = the stack failed or
# rolled back (the failing resources and their reasons are printed), 2 = usage
# or API error.

set -uo pipefail

STACK="assistantx"
REGION=""
INTERVAL=300
STATUS_FILE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --stack)       STACK="$2"; shift 2 ;;
        --region)      REGION="$2"; shift 2 ;;
        --interval)    INTERVAL="$2"; shift 2 ;;
        --status-file) STATUS_FILE="$2"; shift 2 ;;
        -h|--help)     sed -n '15,32p' "$0"; exit 0 ;;
        *)             echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done
(( INTERVAL > 600 )) && INTERVAL=600
(( INTERVAL < 30 )) && INTERVAL=30
# A stack ARN carries its region; otherwise --region, then the environment.
if [[ -z "$REGION" && "$STACK" == arn:aws:cloudformation:* ]]; then
    REGION="$(cut -d: -f4 <<< "$STACK")"
fi
REGION="${REGION:-${AWS_DEFAULT_REGION:-us-east-2}}"

cfn() { aws cloudformation "$@" --region "$REGION"; }
log() { echo "[$(date '+%F %T')] $*"; }

# Resolve the name to its ARN once, so a delete-and-recreate under the same
# name is not mistaken for this stack.
STACK_ID="$(cfn describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackId' --output text 2>&1)" \
    || { log "cannot describe stack $STACK: $STACK_ID"; exit 2; }
log "monitoring $STACK_ID every ${INTERVAL}s"

last_event=""
last_status=""

print_new_events() {
    local events
    events="$(cfn describe-stack-events --stack-name "$STACK_ID" --max-items 100 \
        --query 'StackEvents[].[EventId,Timestamp,LogicalResourceId,ResourceStatus,ResourceStatusReason]' \
        --output text 2>/dev/null)" || return
    # Events come newest first: print those after the last one seen, oldest first.
    local fresh=()
    while IFS=$'\t' read -r id ts res st reason; do
        [[ "$id" == "$last_event" ]] && break
        [[ -z "$res" ]] && continue          # pagination token line
        [[ "$reason" == "None" ]] && reason=""
        fresh+=("$ts  $res  $st${reason:+  $reason}")
    done <<< "$events"
    for (( i=${#fresh[@]}-1; i>=0; i-- )); do echo "    ${fresh[$i]:0:300}"; done
    last_event="$(head -1 <<< "$events" | cut -f1)"
}

cleanup_lambda_enis() {
    local vpc enis
    vpc="$(cfn describe-stack-resource --stack-name "$STACK_ID" --logical-resource-id VPC \
        --query 'StackResourceDetail.PhysicalResourceId' --output text 2>/dev/null)" || return
    [[ -z "$vpc" || "$vpc" == "None" ]] && return
    enis="$(aws ec2 describe-network-interfaces --region "$REGION" \
        --filters "Name=vpc-id,Values=$vpc" "Name=status,Values=available" \
        --query 'NetworkInterfaces[?starts_with(Description, `AWS Lambda VPC ENI`)].NetworkInterfaceId' \
        --output text 2>/dev/null)"
    for eni in $enis; do
        aws ec2 delete-network-interface --region "$REGION" --network-interface-id "$eni" \
            && log "removed detached Lambda ENI $eni (blocks subnet/SG deletion)"
    done
}

report_failures() {
    log "failed resources:"
    cfn describe-stack-events --stack-name "$STACK_ID" \
        --query 'StackEvents[?contains(ResourceStatus, `FAILED`) && ResourceStatusReason != `Resource creation cancelled`].[Timestamp,LogicalResourceId,ResourceType,ResourceStatusReason]' \
        --output text | sed 's/^/    /' | cut -c1-600
}

while true; do
    status="$(cfn describe-stacks --stack-name "$STACK_ID" --query 'Stacks[0].StackStatus' --output text 2>&1)" \
        || { log "describe-stacks failed: $status"; sleep "$INTERVAL"; continue; }
    [[ "$status" != "$last_status" ]] && log "status: $status" || log "status: $status (unchanged)"
    last_status="$status"
    print_new_events
    [[ -n "$STATUS_FILE" ]] && printf '{"stack":"%s","status":"%s","time":"%s"}\n' \
        "$STACK_ID" "$status" "$(date -u +%FT%TZ)" > "$STATUS_FILE"

    case "$status" in
        CREATE_COMPLETE|UPDATE_COMPLETE|IMPORT_COMPLETE)
            log "stack outputs:"
            cfn describe-stacks --stack-name "$STACK_ID" \
                --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output text | sed 's/^/    /'
            exit 0 ;;
        *ROLLBACK_COMPLETE|*_FAILED)
            report_failures
            exit 1 ;;
        DELETE_COMPLETE)
            log "stack deleted"
            exit 1 ;;
        *DELETE_IN_PROGRESS|*ROLLBACK_IN_PROGRESS)
            cleanup_lambda_enis ;;
    esac
    sleep "$INTERVAL"
done
