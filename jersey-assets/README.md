# Coritiba Jersey Assets — LoRA Training (2026 Away Kit)

Assets extracted from James's campaign PDF: **Camisa 2 2026 - Curitiba é Coritiba - Campanha e produção**.

## For Replicate FLUX LoRA training

1. Upload `coritiba_jersey_lora_training.zip` to [ostris/flux-dev-lora-trainer](https://replicate.com/ostris/flux-dev-lora-trainer)
2. **Trigger word:** `coritiba_jersey`
3. **Steps:** 1000 (~20 min, ~$2)
4. **Destination:** your Replicate account (private model)

## Contents of the zip (18 images)

| Group | Count | Description |
|-------|-------|-------------|
| `coritiba_jersey_model_*` | 9 | 1080×1350 product/lifestyle shots |
| `coritiba_jersey_full_body_*` | 3 | Full-body poses |
| `coritiba_jersey_studio_*` | 2 | Studio shots |
| `coritiba_jersey_detail_*` | 4 | Detail/close-up frames |

## Local-only (not in git)

- `Camisa 2 2026 - Curitiba é Coritiba - Campanha e produção.pdf` — source deck (keep on server)
- `extracted-images/` — all 197 raw extractions (regenerate with `pdfimages` if needed)
- `lora-training-set/` — same 18 JPGs as inside the zip

## Campaign context

- **Kit:** 2026 Away / Jogadeira — green with white stripes, jacquard lamp-post pattern
- **Campaign:** "Curitiba é Coritiba"
- **Manufacturer:** Diadora
