package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func postExec(t *testing.T, handler http.HandlerFunc, req execRequest) execResponse {
	t.Helper()
	body, _ := json.Marshal(req)
	r := httptest.NewRequest(http.MethodPost, "/api/exec", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler(w, r)

	var resp execResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v (body: %s)", err, w.Body.String())
	}
	return resp
}

func TestExecEcho(t *testing.T) {
	resp := postExec(t, handleExec, execRequest{
		Command: "echo",
		Args:    []string{"hello world"},
	})
	if !resp.Success {
		t.Fatalf("expected success, got error: %s", resp.Error)
	}
	if resp.Stdout != "hello world\n" {
		t.Errorf("expected stdout 'hello world\\n', got %q", resp.Stdout)
	}
	if resp.ExitCode != 0 {
		t.Errorf("expected exit code 0, got %d", resp.ExitCode)
	}
}

func TestExecWithCwd(t *testing.T) {
	resp := postExec(t, handleExec, execRequest{
		Command: "pwd",
		Cwd:     "/tmp",
	})
	if !resp.Success {
		t.Fatalf("expected success, got error: %s", resp.Error)
	}
	// /tmp may resolve to /private/tmp on macOS
	stdout := resp.Stdout
	if stdout != "/tmp\n" && stdout != "/private/tmp\n" {
		t.Errorf("expected cwd /tmp, got %q", stdout)
	}
}

func TestExecFailingCommand(t *testing.T) {
	resp := postExec(t, handleExec, execRequest{
		Command: "false",
	})
	if resp.Success {
		t.Fatal("expected failure for 'false' command")
	}
	if resp.ExitCode == 0 {
		t.Error("expected non-zero exit code")
	}
}

func TestExecNonexistentCommand(t *testing.T) {
	resp := postExec(t, handleExec, execRequest{
		Command: "this_command_does_not_exist_xyz_12345",
	})
	if resp.Success {
		t.Fatal("expected failure for nonexistent command")
	}
}

func TestExecMultipleArgs(t *testing.T) {
	resp := postExec(t, handleExec, execRequest{
		Command: "printf",
		Args:    []string{"%s-%s", "foo", "bar"},
	})
	if !resp.Success {
		t.Fatalf("expected success, got error: %s", resp.Error)
	}
	if resp.Stdout != "foo-bar" {
		t.Errorf("expected 'foo-bar', got %q", resp.Stdout)
	}
}

func TestExecSpecialCharactersInArgs(t *testing.T) {
	resp := postExec(t, handleExec, execRequest{
		Command: "echo",
		Args:    []string{"hello'world", "it's \"fine\"", "$HOME"},
	})
	if !resp.Success {
		t.Fatalf("expected success, got error: %s", resp.Error)
	}
	expected := "hello'world it's \"fine\" $HOME\n"
	if resp.Stdout != expected {
		t.Errorf("expected %q, got %q", expected, resp.Stdout)
	}
}

func TestExecTimeout(t *testing.T) {
	resp := postExec(t, handleExec, execRequest{
		Command: "sleep",
		Args:    []string{"10"},
		Timeout: 1,
	})
	if resp.Success {
		t.Fatal("expected timeout failure")
	}
	if resp.ExitCode != -1 {
		t.Errorf("expected exit code -1 for timeout, got %d", resp.ExitCode)
	}
}

func TestExecEmptyCommand(t *testing.T) {
	body, _ := json.Marshal(execRequest{Command: ""})
	r := httptest.NewRequest(http.MethodPost, "/api/exec", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleExec(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestExecRejectsGet(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/exec", nil)
	w := httptest.NewRecorder()
	handleExec(w, r)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestExecResolvesPathCommands(t *testing.T) {
	// claude should be findable via the login shell PATH
	resp := postExec(t, handleExec, execRequest{
		Command: "which",
		Args:    []string{"claude"},
	})
	if !resp.Success {
		t.Skipf("claude CLI not installed, skipping: %s", resp.Error)
	}
	if len(resp.Stdout) == 0 {
		t.Error("expected non-empty path for claude")
	}
}

func TestShellQuote(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"hello", "'hello'"},
		{"hello world", "'hello world'"},
		{"it's", "'it'\"'\"'s'"},
		{"$HOME", "'$HOME'"},
		{"a\"b", "'a\"b'"},
	}
	for _, tc := range cases {
		got := shellQuote(tc.input)
		if got != tc.expected {
			t.Errorf("shellQuote(%q) = %q, want %q", tc.input, got, tc.expected)
		}
	}
}
