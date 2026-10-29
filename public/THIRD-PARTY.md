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
