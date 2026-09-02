// Command wordcount reads text from standard input and prints how often each
// word occurs, one "word count" pair per line in alphabetical order.
package main

import (
	"fmt"
	"io"
	"os"

	"example.com/wordcount/internal/wordcount"
)

func main() {
	if err := run(os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "wordcount:", err)
		os.Exit(1)
	}
}

func run(in io.Reader, out io.Writer) error {
	data, err := io.ReadAll(in)
	if err != nil {
		return err
	}
	for _, pair := range wordcount.Sorted(wordcount.Count(string(data))) {
		if _, err := fmt.Fprintf(out, "%s %d\n", pair.Word, pair.Count); err != nil {
			return err
		}
	}
	return nil
}
