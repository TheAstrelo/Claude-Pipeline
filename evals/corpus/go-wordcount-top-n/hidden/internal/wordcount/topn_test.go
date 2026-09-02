// Hidden acceptance test for go-wordcount-top-n. Copied into the candidate
// tree AFTER the pipeline run; the pipeline never sees it.
package wordcount_test

import (
	"reflect"
	"testing"

	"example.com/wordcount/internal/wordcount"
)

func TestTopNReturnsMostFrequentFirst(t *testing.T) {
	got := wordcount.TopN("the cat the dog the cat bird", 2)
	want := []wordcount.Pair{{Word: "the", Count: 3}, {Word: "cat", Count: 2}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("TopN = %v, want %v", got, want)
	}
}

func TestTopNBreaksTiesAlphabetically(t *testing.T) {
	got := wordcount.TopN("pear apple pear apple fig kiwi", 3)
	want := []wordcount.Pair{{Word: "apple", Count: 2}, {Word: "pear", Count: 2}, {Word: "fig", Count: 1}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("TopN = %v, want %v", got, want)
	}
}

func TestTopNWithNLargerThanVocabularyReturnsEverything(t *testing.T) {
	got := wordcount.TopN("b a b", 10)
	want := []wordcount.Pair{{Word: "b", Count: 2}, {Word: "a", Count: 1}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("TopN = %v, want %v", got, want)
	}
}

func TestTopNNormalizesLikeCount(t *testing.T) {
	got := wordcount.TopN("Go, go GO! rust", 1)
	want := []wordcount.Pair{{Word: "go", Count: 3}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("TopN = %v, want %v", got, want)
	}
}

func TestTopNNonPositiveNIsEmpty(t *testing.T) {
	for _, n := range []int{0, -1} {
		if got := wordcount.TopN("a b c", n); len(got) != 0 {
			t.Fatalf("TopN(n=%d) = %v, want empty", n, got)
		}
	}
}

func TestTopNOfEmptyTextIsEmpty(t *testing.T) {
	if got := wordcount.TopN("", 3); len(got) != 0 {
		t.Fatalf("TopN of empty text = %v, want empty", got)
	}
}
