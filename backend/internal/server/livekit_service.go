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
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
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

// scenes maps each scene the agent supports to the device whose skills it loads.
var scenes = map[string]bool{"car": true, "home": true, "charger": true}

// deviceNamePattern restricts device names to plain file stems so a request
// cannot walk out of the skills directory (e.g. "../../configs/config").
var deviceNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

// roomNamePattern is the shape of the room names issued by roomPrefix/newRoomName.
var roomNamePattern = regexp.MustCompile(`^u-[0-9a-f]{16}-[0-9a-f]{16}$`)

// roomPrefix derives a per-user room prefix from the subject, so a user can
// only ever be granted rooms that were issued to them.
func roomPrefix(sub string) string {
	h := sha256.Sum256([]byte(sub))
	return "u-" + hex.EncodeToString(h[:8]) + "-"
}

// newRoomName returns an unguessable room name owned by sub.
func newRoomName(sub string) (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return roomPrefix(sub) + hex.EncodeToString(b), nil
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
	sub, name, err := s.extractUserInfo(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid token"))
	}

	// Rooms are always owned by the caller: a client may rejoin one of its own
	// rooms, but any other name is replaced with a fresh one so nobody can join
	// another user's session.
	roomName := req.Msg.RoomName
	if !roomNamePattern.MatchString(roomName) || !strings.HasPrefix(roomName, roomPrefix(sub)) {
		if roomName, err = newRoomName(sub); err != nil {
			return nil, connect.NewError(connect.CodeInternal, errors.New("generate room name"))
		}
	}

	scene := req.Msg.Scene
	if scene == "" {
		scene = "car"
	}
	if !scenes[scene] {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("unsupported scene: %q", scene))
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
		log.Action("LivekitGetToken").Error("generate token: %v", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("generate token"))
	}

	log.Action("LivekitGetToken").Info("user=%q room=%q scene=%q", sub, roomName, scene)

	// Dispatch agent to the room
	if s.agentClient != nil {
		dispatchMeta, _ := json.Marshal(map[string]string{"scene": scene})
		_, err = s.agentClient.CreateDispatch(ctx, &livekit.CreateAgentDispatchRequest{
			Room:      roomName,
			AgentName: s.cfg.AgentName,
			Metadata:  string(dispatchMeta),
		})
		if err != nil {
			log.Action("LivekitDispatch").Warn("failed to dispatch agent: %v", err)
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

// getSkillsForDevice serves skills/devices/<device>.yaml. This endpoint is
// unauthenticated, so device is validated as a bare file stem and the file is
// opened through os.Root, which refuses any path resolving outside SkillsDir.
func (s *LivekitServer) getSkillsForDevice(device string) (*connect.Response[livekitv1.GetSkillsResponse], error) {
	if !deviceNamePattern.MatchString(device) {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid device name"))
	}

	root, err := os.OpenRoot(s.cfg.SkillsDir)
	if err != nil {
		log.Action("GetSkills").Error("open skills dir: %v", err)
		return nil, connect.NewError(connect.CodeNotFound, errors.New("skills file not found"))
	}
	defer root.Close()

	data, err := root.ReadFile(device + ".yaml")
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("skills file not found"))
	}

	// Parse YAML to generic map
	var raw map[string]interface{}
	if err := yaml.Unmarshal(data, &raw); err != nil {
		log.Action("GetSkills").Error("parse %s skills: %v", device, err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("parse skills"))
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
			return nil, connect.NewError(connect.CodeInternal, errors.New("convert skills"))
		}
	}

	return connect.NewResponse(&livekitv1.GetSkillsResponse{
		Data: st,
	}), nil
}

// extractUserInfo extracts user identity from the Bearer token. The auth
// middleware has already validated it; claims are only ever taken from a
// verified token, never from a decoded-but-unverified payload.
func (s *LivekitServer) extractUserInfo(ctx context.Context) (sub, name string, err error) {
	if s.provider == nil {
		// Guest mode: a random identity so guests never share a room prefix.
		b := make([]byte, 8)
		if _, err := rand.Read(b); err != nil {
			return "", "", err
		}
		return "guest-" + hex.EncodeToString(b), "Guest User", nil
	}

	authHeader := metadata.ExtractIncoming(ctx).Get("authorization")
	token := strings.TrimPrefix(authHeader, "Bearer ")

	claims, err := s.provider.ValidateToken(token)
	if err != nil {
		return "", "", err
	}
	sub = claims.Sub
	name = claims.Name
	if name == "" {
		name = claims.Email
	}
	if name == "" {
		name = claims.Sub
	}
	return sub, name, nil
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
