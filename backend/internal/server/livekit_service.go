// Copyright 2026 AssistantX Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/grpc-ecosystem/go-grpc-middleware/v2/metadata"
	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
	"github.com/ti/common-go/grpcmux"
	"github.com/ti/common-go/log"
	"google.golang.org/protobuf/types/known/structpb"
	"gopkg.in/yaml.v3"

	"github.com/assistantx/backend/internal/dependencies/oidc"
	livekitv1 "github.com/assistantx/backend/pkg/pb/livekit/v1"
	"github.com/assistantx/backend/pkg/pb/livekit/v1/livekitv1connect"
)

// LivekitConfig holds LiveKit-related configuration.
type LivekitConfig struct {
	URL       string `yaml:"url"`
	API       string `yaml:"api"`
	APIKey    string `yaml:"apiKey"`
	APISecret string `yaml:"apiSecret"`
	AgentName string `yaml:"agentName"`
	SkillsDir string `yaml:"skillsDir"`
}

// LivekitServer implements the ConnectRPC LivekitService.
type LivekitServer struct {
	livekitv1connect.UnimplementedLivekitServiceHandler

	provider    *oidc.Provider
	cfg         *LivekitConfig
	agentClient *lksdk.AgentDispatchClient
}

// GetToken generates a LiveKit access token and dispatches an agent.
func (s *LivekitServer) GetToken(
	ctx context.Context,
	req *connect.Request[livekitv1.GetTokenRequest],
) (*connect.Response[livekitv1.GetTokenResponse], error) {
	sub, name := s.extractUserInfo(ctx)

	roomName := req.Msg.RoomName
	if roomName == "" {
		roomName = fmt.Sprintf("room-%d", time.Now().UnixNano()%1000000)
	}

	scene := req.Msg.Scene
	if scene == "" {
		scene = "car"
	}

	// Create access token
	at := auth.NewAccessToken(s.cfg.APIKey, s.cfg.APISecret)
	grant := &auth.VideoGrant{
		RoomJoin: true,
		Room:     roomName,
	}
	at.AddGrant(grant).
		SetIdentity(sub).
		SetName(name).
		SetValidFor(time.Hour)

	// Add agent dispatch metadata
	metadataMap := map[string]interface{}{
		"agent_dispatch": map[string]interface{}{
			"agent_name": s.cfg.AgentName,
			"metadata": map[string]interface{}{
				"scene": scene,
			},
		},
	}
	metadataJSON, _ := json.Marshal(metadataMap)
	at.SetMetadata(string(metadataJSON))

	token, err := at.ToJWT()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("generate token: %w", err))
	}

	log.Action("LivekitGetToken").Info(fmt.Sprintf("user=%s room=%s scene=%s", sub, roomName, scene))

	// Dispatch agent to the room
	if s.agentClient != nil {
		_, err = s.agentClient.CreateDispatch(ctx, &livekit.CreateAgentDispatchRequest{
			Room:      roomName,
			AgentName: s.cfg.AgentName,
			Metadata:  fmt.Sprintf(`{"scene":"%s"}`, scene),
		})
		if err != nil {
			log.Action("LivekitDispatch").Warn(fmt.Sprintf("failed to dispatch agent: %v", err))
		}
	}

	return connect.NewResponse(&livekitv1.GetTokenResponse{
		ServerUrl:        s.cfg.URL,
		ParticipantToken: token,
		Token:            token,
		RoomName:         roomName,
		Identity:         sub,
		Name:             name,
	}), nil
}

// GetSkills returns the default device skills configuration.
func (s *LivekitServer) GetSkills(
	ctx context.Context,
	req *connect.Request[livekitv1.GetSkillsRequest],
) (*connect.Response[livekitv1.GetSkillsResponse], error) {
	return s.getSkillsForDevice("vehicle")
}

// GetDeviceSkills returns skills for a specific device type.
func (s *LivekitServer) GetDeviceSkills(
	ctx context.Context,
	req *connect.Request[livekitv1.GetDeviceSkillsRequest],
) (*connect.Response[livekitv1.GetSkillsResponse], error) {
	device := req.Msg.Device
	if device == "" {
		device = "vehicle"
	}
	return s.getSkillsForDevice(device)
}

func (s *LivekitServer) getSkillsForDevice(device string) (*connect.Response[livekitv1.GetSkillsResponse], error) {
	filename := device + ".yaml"
	path := filepath.Join(s.cfg.SkillsDir, filename)

	data, err := os.ReadFile(path)
	if err != nil {
		// Try to find any available skill file
		files, _ := os.ReadDir(s.cfg.SkillsDir)
		for _, f := range files {
			if strings.HasSuffix(f.Name(), ".yaml") {
				altPath := filepath.Join(s.cfg.SkillsDir, f.Name())
				data, err = os.ReadFile(altPath)
				if err == nil {
					break
				}
			}
		}
		if err != nil {
			return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("skills file not found"))
		}
	}

	// Parse YAML to generic map
	var raw map[string]interface{}
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("parse skills: %w", err))
	}

	// Convert to protobuf Struct
	st, err := structpb.NewStruct(raw)
	if err != nil {
		// Fallback: marshal to JSON and back
		jsonData, _ := json.Marshal(raw)
		var m map[string]interface{}
		json.Unmarshal(jsonData, &m)
		st, err = structpb.NewStruct(m)
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("convert skills: %w", err))
		}
	}

	return connect.NewResponse(&livekitv1.GetSkillsResponse{
		Data: st,
	}), nil
}

// extractUserInfo extracts user identity from the validated Bearer token.
func (s *LivekitServer) extractUserInfo(ctx context.Context) (sub, name string) {
	if s.provider == nil {
		return fmt.Sprintf("user-%s", time.Now().Format("20060102150405")), "Guest User"
	}

	authHeader := metadata.ExtractIncoming(ctx).Get("authorization")
	token := strings.TrimPrefix(authHeader, "Bearer ")

	// Try validated claims first
	claims, err := s.provider.ValidateToken(token)
	if err == nil {
		sub = claims.Sub
		name = claims.Name
		if name == "" {
			name = claims.Email
		}
		if name == "" {
			name = claims.Sub
		}
		return sub, name
	}

	// Fallback: decode JWT payload manually
	parts := strings.Split(token, ".")
	if len(parts) == 3 {
		if payload, err := base64.RawURLEncoding.DecodeString(parts[1]); err == nil {
			var c map[string]interface{}
			if json.Unmarshal(payload, &c) == nil {
				sub, _ = c["sub"].(string)
				name, _ = c["name"].(string)
				if name == "" {
					for _, field := range []string{"username", "email", "phone_number", "sub"} {
						if val, ok := c[field].(string); ok && val != "" {
							name = val
							break
						}
					}
				}
			}
		}
	}

	if sub == "" {
		sub = fmt.Sprintf("user-%s", time.Now().Format("20060102150405"))
		name = "Guest User"
	}
	return sub, name
}

// RegisterLivekitService registers the LivekitService ConnectRPC handler.
func RegisterLivekitService(gs *grpcmux.Server, provider *oidc.Provider, cfg *LivekitConfig) {
	if cfg == nil || cfg.APIKey == "" {
		log.Action("RegisterLivekitService").Info("LiveKit not configured, skipping")
		return
	}

	// Convert WS URL to HTTP for API
	apiURL := cfg.API
	if apiURL == "" {
		apiURL = cfg.URL
		apiURL = strings.Replace(apiURL, "wss://", "https://", 1)
		apiURL = strings.Replace(apiURL, "ws://", "http://", 1)
	}

	agentName := cfg.AgentName
	if agentName == "" {
		agentName = "Assistant"
	}

	skillsDir := cfg.SkillsDir
	if skillsDir == "" {
		skillsDir = "/app/skills/devices"
	}

	srv := &LivekitServer{
		provider:    provider,
		cfg:         cfg,
		agentClient: lksdk.NewAgentDispatchServiceClient(apiURL, cfg.APIKey, cfg.APISecret),
	}
	srv.cfg.AgentName = agentName
	srv.cfg.SkillsDir = skillsDir

	path, handler := livekitv1connect.NewLivekitServiceHandler(srv)
	grpcmux.RegisterConnectHandler(gs, path, handler)
	log.Action("RegisterLivekitService").Info("LiveKit service registered")
}
