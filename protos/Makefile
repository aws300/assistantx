PROTO_DIR     := $(shell pwd)
GO_OUT        := $(PROTO_DIR)/../backend/pkg/pb
TS_OUT        := $(PROTO_DIR)/../frontend/src/gen
PY_OUT        := $(PROTO_DIR)/../ai-agent/src/authspa/generated

.PHONY: all gen gen-python clean clean-python

all: gen

gen: clean
	@echo "Generating protobuf files (Go + TypeScript)..."
	buf generate
	@echo "Done."
	@echo "  Go -> $(GO_OUT)"
	@echo "  TS -> $(TS_OUT)"

# Generate Python stubs for backend-py.
# Uses grpcio-tools (preferred, always available) with buf BSR as fallback.
# Requires: pip install grpcio-tools  (installed in requirements-dev.txt)
gen-python: clean-python
	@echo "Generating protobuf files (Python)..."
	@mkdir -p $(PY_OUT)
	@if python3 -m grpc_tools.protoc --version > /dev/null 2>&1; then \
		echo "Using grpcio-tools..."; \
		python3 -m grpc_tools.protoc \
			-I$(PROTO_DIR) \
			--python_out=$(PY_OUT) \
			--grpc_python_out=$(PY_OUT) \
			auth/v1/auth.proto; \
	else \
		echo "grpcio-tools not found, trying buf BSR plugins (requires internet)..."; \
		buf generate --template buf.gen.python.yaml; \
	fi
	@echo "Adding __init__.py to generated Python packages..."
	find $(PY_OUT) -type d -exec touch {}/__init__.py \;
	@echo "Done."
	@echo "  Python -> $(PY_OUT)"

clean:
	@echo "Cleaning generated files..."
	find $(GO_OUT) -type f \( -name "*.pb.go" -o -name "*.pb.gw.go" -o -name "*.connect.go" \) -delete 2>/dev/null || true
	find $(GO_OUT) -type d -empty -delete 2>/dev/null || true
	find $(TS_OUT) -type f \( -name "*_pb.ts" -o -name "*_connect.ts" \) -delete 2>/dev/null || true
	find $(TS_OUT) -type d -empty -delete 2>/dev/null || true
	@echo "Clean done."

clean-python:
	@echo "Cleaning Python generated files..."
	find $(PY_OUT) -type f \( -name "*_pb2.py" -o -name "*_pb2_grpc.py" -o -name "*_pb2.pyi" \) -delete 2>/dev/null || true
	find $(PY_OUT) -type d -empty -delete 2>/dev/null || true
	@echo "Python clean done."
