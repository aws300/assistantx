// Copyright 2026 AssistantX Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
package server

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"connectrpc.com/connect"
)

func TestGetSkillsRejectsPathTraversal(t *testing.T) {
	base := t.TempDir()
	skills := filepath.Join(base, "skills", "devices")
	if err := os.MkdirAll(skills, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(skills, "home.yaml"), []byte("metadata:\n  device_type: home\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	// A secret config two levels up, as in the container image layout.
	if err := os.MkdirAll(filepath.Join(base, "configs"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(base, "configs", "config.yaml"), []byte("apiSecret: leaked\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	// A symlink inside the skills dir that points outside it.
	if err := os.Symlink(filepath.Join(base, "configs", "config.yaml"), filepath.Join(skills, "evil.yaml")); err != nil {
		t.Fatal(err)
	}

	s := &LivekitServer{cfg: &LivekitConfig{SkillsDir: skills}}

	if _, err := s.getSkillsForDevice("home"); err != nil {
		t.Fatalf("home: unexpected error: %v", err)
	}
	for _, device := range []string{"../../configs/config", "..", "/etc/passwd", "HOME", "home/../home", "evil", "missing"} {
		resp, err := s.getSkillsForDevice(device)
		if err == nil {
			t.Fatalf("device %q: expected error, got %v", device, resp.Msg.Data)
		}
		var ce *connect.Error
		if !errors.As(err, &ce) || strings.Contains(err.Error(), "leaked") {
			t.Fatalf("device %q: unexpected error %v", device, err)
		}
	}
}

func TestRoomNamesAreOwnedByUser(t *testing.T) {
	a, err := newRoomName("alice")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := newRoomName("alice")
	if a == b {
		t.Fatal("room names must be unique")
	}
	if !roomNamePattern.MatchString(a) || !strings.HasPrefix(a, roomPrefix("alice")) {
		t.Fatalf("room %q not owned by alice", a)
	}
	if strings.HasPrefix(a, roomPrefix("bob")) {
		t.Fatal("bob must not own alice's room")
	}
}
