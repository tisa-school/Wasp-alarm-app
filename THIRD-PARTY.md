# Third-party components

Browser inference uses Google's MediaPipe Tasks Vision 1.2.0 (Apache-2.0).
The unmodified runtime and its license are served under `vendor/mediapipe/`.
Dependency integrity is pinned in the npm lockfile.

The MobileNet V2 iNaturalist insect model and its 1,022 output labels are from
Google Coral's `google-coral/test_data` repository at commit
`104342d2d3480b3e66203073dac24f4e2dbb4c41` (Apache-2.0).
The original license and pinned source URLs/SHA-256 hashes are in `models/`.
The model and labels are unmodified. Application grouping and uncertainty rules
are specific to Wasp Buddy, and are not model accuracy guarantees.

The additional general-image model is Google Coral’s unmodified MobileNet V2
ImageNet quantized model, with its 1,001 labels, from the same pinned commit and
under the same Apache-2.0 license. Source URLs and SHA-256 hashes are recorded in
`models/provenance.json`. Its insect-class scores provide an experimental rejection
check; they are not calibrated probabilities that an insect is present.
