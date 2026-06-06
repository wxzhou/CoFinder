# Remote Gzip Progress Decision

## Status

Accepted decision for current CoFinder development. Revisit only if the product explicitly accepts extra remote-tool requirements or approximate progress semantics.

## Decision

Do **not** implement percentage progress for remote gzip in the current product line.

Remote gzip should remain a visible Jobs pane task with status, elapsed time, success/failure, and logs. It should not display a percentage unless the underlying remote operation can report trustworthy progress.

## Rationale

- CoFinder runs remote gzip on the server side. It does not stream all bytes through the app, so the app does not naturally know input bytes processed.
- The commonly suggested `pv` command can report pipe progress, but it is not installed by default on macOS or many servers and should not become a hard dependency.
- Estimating compression ratio from a prefix sample such as the first 1000 lines is unreliable. Compression ratio can vary across a file, and the approach is especially misleading for binary data, already compressed files, sparse files, and sequencing/data files with uneven content distribution.
- Inferring progress from the growing `.gz` output size is also unreliable because output size is a function of compression ratio, not processed input bytes.
- A wrong percentage is worse than an honest indeterminate status for long-running remote work.

## Allowed Future Options

If revisited later, use one of these designs:

- If `pv` is available remotely, optionally use `pv -n -s <input-size>` to show true input-byte progress.
- Without `pv`, show indeterminate progress plus elapsed time and optional output-size text such as `compressed output: 1.2 GB`; do not label it as a percentage.
- For local gzip only, true progress can be implemented by owning the read stream and tracking input bytes, but local gzip progress is not a priority for the current product.

