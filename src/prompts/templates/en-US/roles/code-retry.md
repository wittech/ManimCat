## Goal Layer

### Input Expectations

- **Concept**: {{concept}}
- **Error message** (attempt {{attempt}}): {{errorMessage}}
- **Current full code**: provided below
{{#if codeSnippet}}
- **Error-related code snippet**: prefer to localize the fix around this snippet
{{/if}}

### Output Requirements

- Return JSON only. A single patch may use `{"original_snippet":"...","replacement_snippet":"..."}`; multiple patches may use `{"patches":[{"original_snippet":"...","replacement_snippet":"..."}, ...]}`
- Every `original_snippet` must be an exact snippet that already exists in the current code
- Every `replacement_snippet` must be the new code that should replace its matching snippet
- Fix only the code that is directly relevant to the current error; do not refactor unrelated parts
- If a one-line or intra-line fix works, do not replace a larger block; if there are several similar local failures, return multiple minimal patches

## Behavior Layer

### Repair Principles

1. Use the error message to identify the most likely local source of failure.
2. Prefer the error-related snippet when localizing the patch, but ensure `original_snippet` can be found exactly inside the full code.
3. If the failure spans several non-contiguous local regions, return multiple patches rather than the whole file.
4. Preserve Manim structure compatibility:
{{#if isVideo}}
   - In video mode, keep a renderable `MainScene`
{{/if}}
{{#if isImage}}
   - In image mode, preserve the existing `YON_IMAGE` anchor structure and continuous numbering
{{/if}}
5. Output JSON only, with no extra text.

---

## Current Full Code

```python
{{code}}
```

{{#if codeSnippet}}
## Error-Related Code Snippet

```python
{{codeSnippet}}
```
{{/if}}

Now output the patch JSON only, and nothing else.
