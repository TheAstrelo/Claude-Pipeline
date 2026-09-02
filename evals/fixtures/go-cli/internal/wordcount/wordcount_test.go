package wordcount_test

import (
	"reflect"
	"testing"

	"example.com/wordcount/internal/wordcount"
)

func TestCountNormalizesCaseAndPunctuation(t *testing.T) {
	got := wordcount.Count("Go, go GO! (rust) ...")
	want := map[string]int{"go": 3, "rust": 1}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Count = %v, want %v", got, want)
	}
}

func TestCountOfEmptyTextIsEmpty(t *testing.T) {
	if got := wordcount.Count("   \n\t "); len(got) != 0 {
		t.Fatalf("Count of blank text = %v, want empty", got)
	}
}

func TestSortedIsAlphabetical(t *testing.T) {
	got := wordcount.Sorted(map[string]int{"pear": 2, "apple": 5, "fig": 1})
	want := []wordcount.Pair{{"apple", 5}, {"fig", 1}, {"pear", 2}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Sorted = %v, want %v", got, want)
	}
}
