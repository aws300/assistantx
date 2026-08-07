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
# deploy.sh — Build Docker images, push Helm chart OCI, and deploy to EKS
#
# Usage:
#   ./deploy.sh [command] [args...]
#
# Commands:
#   (default)              — Deploy Helm chart to EKS only (no build)
#   helm                   — Deploy Helm chart to EKS
#   backend                — Build, push Go backend image and restart
#   agent                  — Build, push Python agent image and deploy
#   frontend               — Build, push frontend image and restart
#   docker                 — Build and push all images
#   chart                  — Package and push Helm chart to ECR public OCI
#   all                    — Build all images + push chart + deploy
#   create-irsa-role NAME  — Create an IAM role for IRSA with minimum required permissions

set -euo pipefail

# ============================================================
# Config
# ============================================================
# ECR public registry (images + Helm chart).
# Override with ECR_PUBLIC_REGISTRY to publish under a different registry alias;
# pushing requires that the alias belong to the authenticated AWS account.
ECR_PUBLIC_REGISTRY="${ECR_PUBLIC_REGISTRY:-public.ecr.aws/r0l7m8u0}"
ECR_PUBLIC_IMAGE="${ECR_PUBLIC_REGISTRY}/assistantx"

HELM_RELEASE_NAME="${HELM_RELEASE_NAME:-app}"
HELM_NAMESPACE="${HELM_NAMESPACE:-assistantx}"
HELM_CHART_PATH="${HELM_CHART_PATH:-charts/}"
HELM_VALUES_FILE="${HELM_VALUES_FILE:-}"

# EKS cluster name — used by create-irsa-role to discover the OIDC issuer
EKS_CLUSTER_NAME="${EKS_CLUSTER_NAME:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# AWS_REGION is resolved at runtime via verify_aws().
AWS_REGION=""

# ============================================================
# Helpers
# ============================================================
log()  { echo "[deploy] $*"; }
info() { echo "[deploy] INFO:  $*"; }
warn() { echo "[deploy] WARN:  $*" >&2; }
fail() { echo "[deploy] ERROR: $*" >&2; exit 1; }

check_deps() {
    local missing=()
    for cmd in aws kubectl helm docker; do
        command -v "$cmd" &>/dev/null || missing+=("$cmd")
    done
    [[ ${#missing[@]} -gt 0 ]] && fail "Missing tools: ${missing[*]}"
    info "Dependencies OK: aws / kubectl / helm / docker"
}

verify_aws() {
    log "Verifying AWS credentials..."

    AWS_REGION="${AWS_DEFAULT_REGION:-}"
    if [[ -z "$AWS_REGION" ]]; then
        fail "AWS_REGION could not be determined. Please set:
        export AWS_DEFAULT_REGION=<region>   # e.g. us-west-2"
    fi

    local identity
    identity="$(aws sts get-caller-identity --output json 2>&1)" \
        || fail "Unable to call aws sts get-caller-identity. Check your AWS credentials."

    local account arn
    account="$(echo "$identity" | grep -o '"Account": "[^"]*"' | cut -d'"' -f4)"
    arn="$(echo "$identity"    | grep -o '"Arn": "[^"]*"'     | cut -d'"' -f4)"

    [[ -z "$account" ]] && fail "Could not parse Account ID from STS response."

    info "AWS Account: $account"
    info "AWS Region:  $AWS_REGION"
    info "AWS ARN:     $arn"
}

ecr_public_login() {
    log "Logging into ECR public: $ECR_PUBLIC_REGISTRY ..."
    # ECR public login must use us-east-1
    aws ecr-public get-login-password --region us-east-1 \
        | docker login --username AWS --password-stdin public.ecr.aws \
        || fail "ECR public login failed"
    info "ECR public login OK"
}

helm_ecr_login() {
    log "Logging Helm into ECR public OCI registry..."
    aws ecr-public get-login-password --region us-east-1 \
        | helm registry login --username AWS --password-stdin public.ecr.aws \
        || fail "Helm ECR public login failed"
    info "Helm ECR public login OK"
}

restart_deployment() {
    local name="$1"
    log "Restarting deployment: $name ..."
    kubectl rollout restart deployment/"$name" -n "$HELM_NAMESPACE" || warn "Restart $name failed"
    kubectl rollout status deployment/"$name" -n "$HELM_NAMESPACE" --timeout=5m 2>&1 || true
}

restart_deployments() {
    log "Restarting all deployments in namespace '$HELM_NAMESPACE' ..."
    local deployments
    deployments="$(kubectl get deployments -n "$HELM_NAMESPACE" \
        -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true)"
    [[ -z "$deployments" ]] && { info "No deployments found, skipping"; return; }
    for dep in $deployments; do
        info "Restarting: $dep"
        kubectl rollout restart deployment/"$dep" -n "$HELM_NAMESPACE" || warn "Restart $dep failed"
    done
}

# ============================================================
# Build functions
# ============================================================
build_backend() {
    log "========== backend (Go): proto → build → push → restart =========="
    ecr_public_login

    log "[1/3] Generating protobuf..."
    command -v buf &>/dev/null || fail "buf not installed"
    make -C "$SCRIPT_DIR/protos"

    log "[2/3] Building and pushing backend image..."
    local image="${ECR_PUBLIC_IMAGE}:backend"
    docker build -t "$image" "$SCRIPT_DIR/backend" || fail "backend build failed"
    docker push "$image"                            || fail "backend push failed"
    info "Backend image pushed: $image"

    log "[3/3] Restarting backend..."
    restart_deployment "assistantx-backend"
    log "========== backend done =========="
}

build_agent() {
    log "========== agent (Python): build → push → helm deploy =========="
    ecr_public_login

    log "[1/3] Building and pushing agent image..."
    local image="${ECR_PUBLIC_IMAGE}:agent"
    docker build \
        -t "$image" \
        "$SCRIPT_DIR/agent" \
        || fail "agent build failed"
    docker push "$image" || fail "agent push failed"
    info "Agent image pushed: $image"

    log "[2/3] Deploying Helm chart with agent image..."
    local values_args=()
    if [[ -n "$HELM_VALUES_FILE" ]]; then
        [[ -f "$SCRIPT_DIR/$HELM_VALUES_FILE" ]] \
            || fail "Helm values file not found: $SCRIPT_DIR/$HELM_VALUES_FILE"
        values_args=(--values "$SCRIPT_DIR/$HELM_VALUES_FILE")
    fi

    helm upgrade --install "$HELM_RELEASE_NAME" "$SCRIPT_DIR/$HELM_CHART_PATH" \
        --namespace "$HELM_NAMESPACE" \
        --create-namespace \
        "${values_args[@]}" \
        --set "assistantx.image.agent=${image}" \
        || fail "Helm deploy with agent failed"

    log "[3/3] Restarting agent deployment..."
    restart_deployment "assistantx-agent"
    log "========== agent done =========="
}

build_frontend() {
    log "========== frontend: build → push → restart =========="
    ecr_public_login

    log "[1/2] Building and pushing frontend image..."
    local image="${ECR_PUBLIC_IMAGE}:frontend"
    docker build -t "$image" "$SCRIPT_DIR/frontend" || fail "frontend build failed"
    docker push "$image"                             || fail "frontend push failed"
    info "Frontend image pushed: $image"

    log "[2/2] Restarting frontend..."
    restart_deployment "assistantx-frontend"
    log "========== frontend done =========="
}

build_docker() {
    log "========== Building all images =========="
    ecr_public_login

    log "[1/3] Generating protobuf..."
    command -v buf &>/dev/null || fail "buf not installed"
    make -C "$SCRIPT_DIR/protos"

    log "[2/3] Compiling backend (local check)..."
    cd "$SCRIPT_DIR/backend"
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-w -s" -o /dev/null ./cmd/server \
        || fail "backend compile failed"
    cd "$SCRIPT_DIR"
    info "Backend compile OK"

    log "[3/3] Building and pushing images..."
    local backend_image="${ECR_PUBLIC_IMAGE}:backend"
    local agent_image="${ECR_PUBLIC_IMAGE}:agent"
    local frontend_image="${ECR_PUBLIC_IMAGE}:frontend"

    docker build -t "$backend_image"  "$SCRIPT_DIR/backend"  || fail "backend build failed"
    docker push "$backend_image"                              || fail "backend push failed"
    info "Pushed: $backend_image"

    docker build -t "$agent_image"    "$SCRIPT_DIR/agent"    || fail "agent build failed"
    docker push "$agent_image"                                || fail "agent push failed"
    info "Pushed: $agent_image"

    docker build -t "$frontend_image" "$SCRIPT_DIR/frontend" || fail "frontend build failed"
    docker push "$frontend_image"                             || fail "frontend push failed"
    info "Pushed: $frontend_image"

    log "========== All images built and pushed =========="
}

push_chart() {
    log "========== Packaging and pushing Helm chart to ECR public OCI =========="
    helm_ecr_login

    local chart_dir="$SCRIPT_DIR/$HELM_CHART_PATH"
    [[ -d "$chart_dir" ]] || fail "Helm chart directory not found: $chart_dir"

    # Extract chart version from Chart.yaml
    local version
    version="$(grep '^version:' "$chart_dir/Chart.yaml" | awk '{print $2}')"
    [[ -z "$version" ]] && fail "Could not read version from Chart.yaml"
    info "Chart version: $version"

    local pkg_dir
    pkg_dir="$(mktemp -d)"
    trap "rm -rf $pkg_dir" EXIT

    helm package "$chart_dir" --destination "$pkg_dir" \
        || fail "helm package failed"

    local pkg_file
    pkg_file="$(ls "$pkg_dir"/*.tgz | head -1)"

    helm push "$pkg_file" "oci://${ECR_PUBLIC_REGISTRY}" \
        || fail "helm push failed"

    info "Helm chart pushed: oci://${ECR_PUBLIC_REGISTRY}/assistantx:${version}"
    log "========== Helm chart pushed =========="
}

create_irsa_role() {
    local role_name="${1:-CnfPodIrsaRole}"

    log "========== Creating IRSA role: $role_name =========="

    # ── Resolve account ID and region ──────────────────────────────────────
    local identity account_id
    identity="$(aws sts get-caller-identity --output json)"
    account_id="$(echo "$identity" | grep -o '"Account": "[^"]*"' | cut -d'"' -f4)"
    [[ -z "$account_id" ]] && fail "Could not resolve AWS account ID"
    info "AWS Account:  $account_id"
    info "AWS Region:   $AWS_REGION"

    # ── Resolve EKS OIDC issuer ─────────────────────────────────────────────
    [[ -z "$EKS_CLUSTER_NAME" ]] && fail "EKS_CLUSTER_NAME is not set.
    export EKS_CLUSTER_NAME=<your-cluster-name>"

    log "Fetching OIDC issuer for cluster '$EKS_CLUSTER_NAME'..."
    local oidc_issuer_url
    oidc_issuer_url="$(aws eks describe-cluster \
        --name "$EKS_CLUSTER_NAME" \
        --region "$AWS_REGION" \
        --query "cluster.identity.oidc.issuer" \
        --output text)" \
        || fail "Could not describe EKS cluster '$EKS_CLUSTER_NAME'"

    [[ -z "$oidc_issuer_url" || "$oidc_issuer_url" == "None" ]] \
        && fail "OIDC issuer not found for cluster '$EKS_CLUSTER_NAME'. Enable OIDC provider first."

    # Strip leading https://
    local oidc_issuer="${oidc_issuer_url#https://}"
    info "OIDC issuer:  $oidc_issuer"

    # ── Build trust policy ──────────────────────────────────────────────────
    local trust_policy
    trust_policy="$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${account_id}:oidc-provider/${oidc_issuer}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${oidc_issuer}:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
EOF
)"

    # ── Create the IAM role ─────────────────────────────────────────────────
    local role_arn="arn:aws:iam::${account_id}:role/${role_name}"

    if aws iam get-role --role-name "$role_name" &>/dev/null; then
        warn "Role '$role_name' already exists — skipping creation, updating trust policy and description..."
        aws iam update-assume-role-policy \
            --role-name "$role_name" \
            --policy-document "$trust_policy" \
            || fail "Failed to update trust policy for '$role_name'"
        aws iam update-role \
            --role-name "$role_name" \
            --description "IRSA role for cloud native backend" \
            || fail "Failed to update description for '$role_name'"
        info "Trust policy and description updated"
    else
        log "Creating IAM role '$role_name'..."
        aws iam create-role \
            --role-name "$role_name" \
            --assume-role-policy-document "$trust_policy" \
            --description "IRSA role for cloud native backend" \
            --output text --query "Role.RoleName" \
            || fail "Failed to create IAM role '$role_name'"
        info "IAM role created: $role_arn"
    fi

    # ── Attach inline policy (minimum permissions for full IRSA Info Display) ─
    local policy_name="ScaffoldingIRSAInfoPolicy"
    local policy_file="$SCRIPT_DIR/scripts/irsa-policy.json"
    [[ -f "$policy_file" ]] || fail "Policy template not found: $policy_file"

    local inline_policy
    inline_policy="$(sed \
        -e "s/__ACCOUNT_ID__/${account_id}/g" \
        -e "s/__ROLE_NAME__/${role_name}/g" \
        "$policy_file")"

    log "Attaching inline policy '$policy_name'..."
    aws iam put-role-policy \
        --role-name "$role_name" \
        --policy-name "$policy_name" \
        --policy-document "$inline_policy" \
        || fail "Failed to attach inline policy"
    info "Inline policy '$policy_name' attached"

    log "========== IRSA role ready =========="
    echo ""
    echo "  Role ARN:  $role_arn"
    echo ""
    echo "  Use it in Helm:"
    echo "    --set assistantx.irsaRoleArn=\"$role_arn\""
    echo ""
}

deploy_helm() {
    log "========== Deploying Helm chart to EKS =========="

    [[ -d "$SCRIPT_DIR/$HELM_CHART_PATH" ]] \
        || fail "Helm chart directory not found: $SCRIPT_DIR/$HELM_CHART_PATH"

    info "Release:    $HELM_RELEASE_NAME"
    info "Namespace:  $HELM_NAMESPACE"
    info "Chart:      $SCRIPT_DIR/$HELM_CHART_PATH"

    local values_args=()
    if [[ -n "$HELM_VALUES_FILE" ]]; then
        [[ -f "$SCRIPT_DIR/$HELM_VALUES_FILE" ]] \
            || fail "Helm values file not found: $SCRIPT_DIR/$HELM_VALUES_FILE"
        values_args=(--values "$SCRIPT_DIR/$HELM_VALUES_FILE")
        info "Values:     $SCRIPT_DIR/$HELM_VALUES_FILE"
    fi

    helm upgrade --install "$HELM_RELEASE_NAME" "$SCRIPT_DIR/$HELM_CHART_PATH" \
        --namespace "$HELM_NAMESPACE" \
        --create-namespace \
        "${values_args[@]}" \
        || fail "Helm deploy failed"

    log "Helm deploy successful"
    restart_deployments

    log "Checking deployment status..."
    kubectl get all -n "$HELM_NAMESPACE" 2>&1 || true
}

show_help() {
    echo "Usage: $0 [command] [args...]"
    echo ""
    echo "Commands:"
    echo "  (default)              Deploy Helm chart to EKS (no build)"
    echo "  helm                   Deploy Helm chart to EKS"
    echo "  backend                Build, push Go backend image (:backend) and restart"
    echo "  agent                  Build, push Python agent image (:agent) and deploy"
    echo "  frontend               Build, push frontend image (:frontend) and restart"
    echo "  docker                 Build and push all images (backend + agent + frontend)"
    echo "  chart                  Package and push Helm chart to oci://public.ecr.aws/b1y9i2f3"
    echo "  all                    Build all images + push chart + deploy"
    echo "  create-irsa-role NAME  Create IAM role NAME with minimum IRSA permissions"
    echo "                         (reads policy template from scripts/irsa-policy.json)"
    echo "  help                   Show this help"
    echo ""
    echo "Required environment variables:"
    echo "  AWS_DEFAULT_REGION        AWS region (e.g. us-west-2)"
    echo "  AWS_ACCESS_KEY_ID         AWS credentials"
    echo "  AWS_SECRET_ACCESS_KEY     AWS credentials"
    echo "  AWS_SESSION_TOKEN         AWS credentials (if using temporary credentials)"
    echo ""
    echo "Optional environment variables:"
    echo "  HELM_RELEASE_NAME         default: app"
    echo "  HELM_NAMESPACE            default: scaffolding"
    echo "  HELM_VALUES_FILE          default: (none, uses charts/values.yaml)"
    echo "  EKS_CLUSTER_NAME          required for: create-irsa-role"
}

# ============================================================
# Main
# ============================================================
COMMAND="${1:-helm}"
check_deps

# help does not need AWS credentials
if [[ "$COMMAND" == "help" || "$COMMAND" == "--help" || "$COMMAND" == "-h" ]]; then
    show_help
    exit 0
fi

verify_aws

case "$COMMAND" in
    helm)              deploy_helm ;;
    backend)           build_backend ;;
    agent)             build_agent ;;
    frontend)          build_frontend ;;
    docker)            build_docker ;;
    chart)             push_chart ;;
    all)               build_docker && push_chart && deploy_helm ;;
    create-irsa-role)  create_irsa_role "${2:-}" ;;
    *)                 fail "Unknown command: $COMMAND. Run '$0 help'" ;;
esac
