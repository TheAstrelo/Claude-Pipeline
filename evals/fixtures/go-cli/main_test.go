package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestRunPrintsAlphabeticalCounts(t *testing.T) {
	var out bytes.Buffer
	if err := run(strings.NewReader("b a b"), &out); err != nil {
		t.Fatalf("run returned error: %v", err)
	}
	want := "a 1\nb 2\n"
	if out.String() != want {
		t.Fatalf("run output = %q, want %q", out.String(), want)
	}
}
