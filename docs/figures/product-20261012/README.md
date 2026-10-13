# WebROMS explanatory figures

Four landscape PNGs generated with the built-in image generation tool.
These are conceptual diagrams, not screenshots or measured scientific results.

1. `01-overview.png`: distribution, browser computation, visualization and file outputs.
2. `02-wasm.png`: ahead-of-time compilation and the separation of UI from computation.
3. `03-save-load.png`: JSON validation and reconstruction, initial-state reruns and result packages.
4. `04-architecture.png`: deployment boundary, main thread, calculation Worker, WASM and file IO modules.

## Implementation references

- `README.md`: supported configuration and limitations.
- `app.js`: project import, validation, UI state and Worker communication.
- `src/model.js`: defaults, field generation and validation.
- `src/explicit-save.js`: explicit file selection and JSON serialization.
- `runtime/roms-worker.js`: model selection, integration and additional export RUN.
- `src/roms-input.js`: generated ROMS configuration and NetCDF input fields.
- `native/bridge.f90`: C ABI entry points, compiled into WASM (not interpreted in the browser).
- `src/runtime-state.js`: state snapshots from WASM memory.
- `src/stream-export.js` and `src/experiment-report.js`: streamed result ZIP and XLSX reports.

## Interpretation

Arrows group logical data flows; they do not enumerate every function call.
Progress and file chunks are handled by the main thread; numerical snapshots feed visualization.
The virtual filesystem and the computational arrays are distinct in-memory facilities.
The deployment host only serves files; the calculation takes place on the user's device.
Supported prebuilt numerical configurations are supplied, not all ROMS build options.
Project JSON restores experimental settings, not a saved numerical restart state.
The application does not import Excel as a settings file.
Result packages do not include the application executable.
Initial NetCDF and two-dimensional GIS imports have format/coordinate requirements.
Bundled data can be used offline; external data retrieval requires connectivity.
Checking the distribution identifier helps reproducibility but is not a guarantee of scientific validity.

The final prompt set and targeted architecture-arrow correction are in `prompts.md`.
