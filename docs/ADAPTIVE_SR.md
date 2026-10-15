# Adaptive-SR integration preparation

## Status

WebROMS will evaluate adaptive-sr for bathymetric super-resolution, subject to
obtaining commercial permission and suitable trained weights from its authors.
Inference is not enabled. The existing ETOPO and interpolation pipeline remains
unchanged. No random or untrained network is used as a substitute.

Source reviewed on 2026-10-15:

- Repository: https://github.com/matsuokadaisuke/adaptive-sr
- Commit: `12e4304c9a66adf81d9ff8067ea4befa590a75f0`
- Release: `v1.0.0`
- Paper: https://doi.org/10.1029/2024EA003610
- License: https://github.com/matsuokadaisuke/adaptive-sr/blob/12e4304c9a66adf81d9ff8067ea4befa590a75f0/LICENSE

The reviewed license permits non-commercial purposes only and explicitly does
not grant a right to sell the software or derivative works. Citation alone does
not resolve this restriction. The reviewed checkout contains no trained weights
in HDF5, Keras, SavedModel, ONNX or checkpoint form. Release assets should not be
assumed to include trained weights without checking them.

The local research checkout is excluded from Git and is outside `vendor/`, so
the WebROMS build does not copy it into the application. No upstream source or
model weights have been incorporated into WebROMS runtime code.

## Questions for the authors

Obtain written terms covering both code and the separately supplied weights:

1. Commercial use, modification, redistribution and paid WebROMS distribution.
2. Redistribution of converted weights, including a browser inference format.
3. Attribution, paper citation, required notices and any separate model terms.
4. A trained checkpoint, its architecture and complete training configuration.
5. Exact normalization and inverse normalization, units, sign convention,
   training depth range, geographical coverage and horizontal cell spacing.
6. Expected patch dimensions, super-resolution factors, padding and tile overlap.
7. Training data provenance and restrictions applicable to distributed weights.
8. A reference input and expected output for verifying the converted model.
9. Treatment and validation of coastlines, land masks and missing observations.

Do not load untrusted Python pickle or checkpoint files in the application.
Perform any necessary conversion in an isolated developer environment.

## Proposed WebROMS pipeline

```text
Original depth points / contours / bathymetry NetCDF
                         +
                ETOPO outside coverage
                         |
             Geographic reference terrain
                         |
        Crop / conservative coarsening / SR inference
                         |
       Correction against original observations and mask
                         |
                 ROMS computation grid
```

Retain the original reference terrain independently of the current computation
grid. Repeated grid changes must resample that reference, not successively
degrade the last resampled grid. This reference-data retention is planned work,
not a capability supplied merely by cloning adaptive-sr.

The selected checkpoint determines the actual inference implementation. The
upstream example uses TensorFlow/Keras ESPCN with a 16 x 16 x 1 input and a 4x
scale. Other architectures are also present. These example settings are not
evidence of a trained, geographically general model.

Normalization requires particular care: the example YAML specifies a range,
but the reviewed data generator normalizes LR and HR arrays using their data
minima and maxima. The correct inference and inverse transformation must be
confirmed for the supplied checkpoint rather than guessed from the YAML.

Browser conversion will be evaluated after selecting the checkpoint. It must
preserve the convolution, padding and sub-pixel rearrangement operations and
match the author's numerical reference. A Python/TensorFlow installation must
not become a requirement for ordinary WebROMS users.

## Safeguards and acceptance tests

- Fix trusted coastlines and keep observation constraints independently of SR.
- Apply SR only where the selected model's input assumptions are satisfied.
- Do not represent inferred small-scale features as measured bathymetry.
- Reject non-finite outputs and incompatible units or normalization metadata.
- Validate channels, narrow straits, wet area, volume and bottom slope after
  regridding; coarsening cannot preserve every sub-grid channel.
- Compare with interpolation-only and ETOPO baselines using held-out surveys.
- Verify cropped and tiled inference has no seams or coordinate shifts.
- Record model identifier, weight hash, normalization, bounds, source-data
  provenance and generated terrain in explicitly saved project data.
- Save the generated terrain itself so a recipient can run the ocean experiment
  without obtaining or executing the SR model again.
- Show inference progress and preserve the original terrain on cancellation or
  failure. Do not silently label an interpolation fallback as model inference.

## Draft inquiry

Subject: Commercial licensing and trained weights for adaptive-sr / WebROMS

Dear adaptive-sr authors,

We are developing WebROMS, a GUI-based ocean-modeling platform intended for
research and education, with possible commercial distribution. We would like
to evaluate adaptive-sr for bathymetric refinement using ETOPO and user-supplied
depth observations, followed by corrections against the original data.

We understand that the current repository license permits non-commercial use
only. Could you advise whether commercial use, modification and redistribution
within WebROMS, including distribution of browser-converted model weights,
could be licensed separately?

Could you also provide, or indicate how to obtain, trained weights together
with their usage terms, architecture/configuration, normalization and inverse
normalization details, supported depth and spatial-resolution ranges, and a
reference input/output pair for validating conversion?

We will preserve the required attribution and cite your 2025 paper. We have not
enabled inference or distributed your code or weights within WebROMS.

Thank you for considering this request.
