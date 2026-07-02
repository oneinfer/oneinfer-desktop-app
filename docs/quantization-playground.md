# Quantization Playground

This document explains how the OneInfer Edge quantization playground works, which quantization schemes it exposes, and how the UI presents evaluation results.

## Purpose

The quantization playground helps users test whether a model can be compressed for edge deployment without losing too much quality. It compares a baseline model output against a quantized artifact and reports quality, size, speed, and deployment-readiness signals.

The current implementation is focused on local GGUF evaluation through `llama.cpp` tools.

## User Flow

The playground is organized as a four-step flow:

1. Configure
2. Evaluate
3. Analyze
4. Deploy

### Configure

Users choose:

- Model source
- Target machine
- Evaluation dataset
- Metrics to run
- Quantization scheme
- Optional advanced thresholds

Supported model sources:

- Hugging Face repo
- OneInfer catalog
- Local file

Current local quantization support is GGUF-first. Hugging Face repos work best when the repo exposes `.gguf` artifacts. Transformer/safetensors repos can be converted to GGUF when the local conversion path and dependencies are available.

### Evaluate

The app creates a quantization job under the Electron user data directory:

```text
~/Library/Application Support/oneinfer-edge/quantization-runs/<job-id>/
```

For local runs, the main process:

1. Resolves the source model.
2. Downloads or reuses cached Hugging Face GGUF artifacts.
3. Selects the baseline model path.
4. Selects or creates the quantized model path.
5. Runs selected metrics.
6. Writes `report.json`.

### Analyze

The UI reads the returned report and shows:

- Recommendation state
- Headline metrics
- Baseline vs quantized output diff
- Token accuracy details
- Benchmark table
- Layer sensitivity placeholder
- Pareto frontier view

### Deploy

The deploy screen currently prepares an artifact/export-oriented workflow. Deployment should only be enabled when the requested quality and performance metrics are measured successfully.

## Model Resolution

### Local File

For `Local file`, the user provides a local `.gguf` path. The runner uses that file as the baseline model.

If the file is already quantized, `llama.cpp` cannot always requantize it to a different quantization type. In that case the user should provide an F16/FP16 GGUF baseline or select the same quantization scheme as the file.

### Hugging Face GGUF Repo

For Hugging Face repos with GGUF artifacts, the app caches downloads in:

```text
~/Library/Application Support/oneinfer-edge/model-cache/huggingface/
```

The intended behavior is:

- Pick a higher-quality baseline artifact when available, preferring F16/FP16, then Q8, Q6, Q5, and so on.
- Pick the exact selected quantization artifact as the target when it exists.
- Reuse cached files instead of downloading every run.

Example:

```text
TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF
```

If the user selects `Q4_K_S`, the target should be the repo's `Q4_K_S` GGUF. The baseline should be the highest-quality available artifact in that repo, not the same `Q4_K_S` file.

### Hugging Face Safetensors/Transformers Repo

When no GGUF artifact is available, the app attempts a conversion path:

1. Download a Hugging Face snapshot.
2. Use the `llama.cpp` converter to create an F16 GGUF.
3. Use that converted GGUF as the local baseline.
4. Quantize from that baseline using `llama-quantize`.

This path needs Python, Hugging Face dependencies, converter dependencies, and `llama.cpp` converter scripts.

## Quantization Schemes

The UI exposes these scheme options:

```text
Q2_K
Q3_K_S
Q3_K_M
Q3_K_L
Q4_0
Q4_1
Q4_K_S
Q4_K_M
Q5_0
Q5_1
Q5_K_S
Q5_K_M
Q6_K
Q8_0
INT4 AWQ
INT4 GPTQ
INT8
FP16 baseline
Compare all
```

The local `llama.cpp` runner currently maps these schemes:

| UI scheme | Local runner mapping |
| --- | --- |
| `Q2_K` | `Q2_K` |
| `Q3_K_S` | `Q3_K_S` |
| `Q3_K_M` | `Q3_K_M` |
| `Q3_K_L` | `Q3_K_L` |
| `Q4_0` | `Q4_0` |
| `Q4_1` | `Q4_1` |
| `Q4_K_S` | `Q4_K_S` |
| `Q4_K_M` | `Q4_K_M` |
| `Q5_0` | `Q5_0` |
| `Q5_1` | `Q5_1` |
| `Q5_K_S` | `Q5_K_S` |
| `Q5_K_M` | `Q5_K_M` |
| `Q6_K` | `Q6_K` |
| `Q8_0` | `Q8_0` |
| `INT8` | `Q8_0` |

`INT4 AWQ` and `INT4 GPTQ` are shown in the UI as target schemes, but they are not executed by the current local `llama.cpp` runner. They need a separate AWQ/GPTQ backend path.

`Compare all` runs this local scheme set:

```text
Q8_0, Q6_K, Q5_K_M, Q5_K_S, Q4_K_M, Q4_K_S, Q3_K_M, Q2_K
```

## Evaluation Datasets

The UI lists these dataset options:

```text
wikitext2
c4 small
pile validation
ptb
openwebtext sample
chat prompts
coding prompts
reasoning prompts
summarization prompts
custom eval set
```

The current local runner uses built-in evaluation text for local quick evals. The selected dataset is reflected in the job metadata/progress, but full external dataset loading and scoring is not fully wired yet.

## Metrics

### Token Agreement

Token agreement compares generated baseline output against generated quantized output for the selected prompt.

The current calculation:

1. Split baseline output into whitespace tokens.
2. Split quantized output into whitespace tokens.
3. Compare tokens at the same positions.
4. Report `matches / max(token_count)` as a percentage.

Important interpretation:

- `100%` means the sampled prompt output matched.
- It does not mean global model accuracy is 100%.
- Short deterministic prompts can frequently produce `100%`, especially with small generation length and temperature `0`.

Better user-facing label:

```text
Prompt agreement
```

or

```text
Sample token agreement
```

### Perplexity

Perplexity is measured with `llama-perplexity` when available.

The app parses both common output formats:

```text
PPL = 8.24
```

and indexed output like:

```text
[1]1.0528,[2]1.0693,...[60]1.0780
```

When indexed values are returned, the latest indexed value is used.

Lower perplexity is generally better, but it should be compared against the baseline and interpreted with the dataset used.

### Tokens/sec

Tokens/sec is measured from `llama.cpp` timing output when available.

If timing output is not printed, the app derives a fallback:

```text
generated_output_token_count / generation_duration_seconds
```

This keeps the UI from showing "Not measured" when generation succeeded but `llama.cpp` did not emit timing.

### Model Size

Model size is read from the final quantized artifact on disk.

Compression ratio:

```text
quantized_size_bytes / baseline_size_bytes
```

The UI displays a smaller/larger percentage from that ratio.

### Unsupported Local Benchmarks

These benchmark toggles exist in the UI but currently require a benchmark scoring backend or additional local evaluator:

- MMLU
- HellaSwag
- TruthfulQA
- ARC-Challenge
- WinoGrande
- GSM8K
- HumanEval
- BERTScore
- Precise TTFT
- Peak memory

The app reports these as skipped/unsupported for the current local runner.

## Result Presentation

### Recommendation Panel

The recommendation panel can be in one of three states:

| State | Meaning |
| --- | --- |
| Recommendation | Required metrics were measured and the selected scheme is deployable from the playground perspective. |
| Evaluation incomplete | One or more requested metrics are missing. Deploy is disabled. |
| Evaluation failed | Generation or evaluation failed. Deploy is disabled. |

### Headline Cards

The Analyze view shows:

- Token agreement
- Perplexity
- Model size
- Tokens/sec

If a value cannot be measured, the UI shows:

```text
Not measured
```

### Output Diff

The output diff compares baseline text against quantized text.

The quantized output highlights only tokens that differ from the baseline token at the same position.

If no tokens are highlighted and token agreement is `100%`, the sampled outputs matched.

### Benchmark Table

The benchmark table repeats the detailed values:

- Perplexity
- Prompt agreement
- Tokens/sec
- Model size

Unsupported benchmarks are listed with the reason they were skipped.

### Pareto Frontier

The Pareto section lists scheme-level tradeoffs when multiple runs are available, especially from `Compare all`.

Each point shows:

- Scheme
- Prompt agreement
- Size
- Tokens/sec

## Cache And Cleanup

The app stores shared Hugging Face downloads here:

```text
~/Library/Application Support/oneinfer-edge/model-cache/
```

It stores per-run artifacts and reports here:

```text
~/Library/Application Support/oneinfer-edge/quantization-runs/
```

The Quantization tab includes:

```text
Delete downloaded models
```

That button clears:

- Hugging Face model cache
- Converted GGUF files
- Quantized artifacts
- Quantization reports

After cleanup, the next evaluation downloads or regenerates the needed artifacts.

## Required Local Tools

Local quantization and evaluation depend on `llama.cpp` tools:

| Tool | Purpose |
| --- | --- |
| `llama-quantize` | Creates quantized GGUF artifacts from supported baseline GGUF files. |
| `llama-perplexity` | Runs perplexity evaluation. |
| `llama-completion` | Runs prompt generation for baseline and quantized outputs. |

On macOS, the app also forces CPU execution for local evaluation:

```text
-ngl 0 -dev none
```

This avoids Metal/GPU initialization failures on machines where the Metal backend cannot create a command queue.

## Known Limitations

- Local runs currently support GGUF through `llama.cpp`.
- AWQ/GPTQ schemes are UI-visible but need dedicated backend execution.
- External dataset loading is not fully implemented for all dataset options.
- Task benchmark scoring requires a benchmark runner or cloud backend.
- Short deterministic prompts may show `100%` prompt agreement even when larger evaluations would reveal quality differences.
- Existing quantized GGUF files cannot always be requantized into another scheme; use an F16/FP16 baseline when possible.

## Testing Notes

For visible differences, use:

- Longer generation length.
- Harder prompts.
- Creative writing prompts.
- Exact formatting prompts.
- Code generation prompts.
- Lower-bit schemes like `Q3_K_M` or `Q2_K`.
- A true F16/FP16 GGUF baseline.

Example prompts:

```text
Write a 6-line poem about a robot learning music.
```

```text
Solve step by step: If a train travels 45 km in 30 minutes, what is its speed in km/h?
```

```text
Write a Python function to check whether a string is a palindrome. Include edge cases.
```

