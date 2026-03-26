#!/bin/bash
# Print a numbered string so every character position is verifiable
# Format: |001|002|003|...|074|075|END
line=""
for i in $(seq -w 1 75); do
  line="${line}|${i}"
done
line="${line}|END"
printf '%s\n' "$line"
