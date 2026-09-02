// Package wordcount counts word frequencies in text.
package wordcount

import (
	"sort"
	"strings"
)

// Pair is a word together with the number of times it occurred.
type Pair struct {
	Word  string
	Count int
}

// Count returns how often each word occurs in text. Words are split on
// whitespace, lower-cased, and stripped of surrounding punctuation; fields
// that are nothing but punctuation are ignored.
func Count(text string) map[string]int {
	counts := make(map[string]int)
	for _, field := range strings.Fields(text) {
		if word := normalize(field); word != "" {
			counts[word]++
		}
	}
	return counts
}

// Sorted returns every counted word as a Pair, in alphabetical order.
func Sorted(counts map[string]int) []Pair {
	pairs := make([]Pair, 0, len(counts))
	for word, n := range counts {
		pairs = append(pairs, Pair{Word: word, Count: n})
	}
	sort.Slice(pairs, func(i, j int) bool { return pairs[i].Word < pairs[j].Word })
	return pairs
}

func normalize(field string) string {
	return strings.ToLower(strings.Trim(field, ".,;:!?\"'()[]{}"))
}
