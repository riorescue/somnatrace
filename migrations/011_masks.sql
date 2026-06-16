-- Mask catalog and per-session mask/notes metadata.
--
-- Masks are seeded once here with stable IDs so that default_mask_id in
-- app_settings can reference them by text key across server restarts.

CREATE TABLE masks (
  id           TEXT PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  name         TEXT NOT NULL,
  mask_type    TEXT NOT NULL,   -- 'full_face' | 'nasal' | 'nasal_pillow' | 'oral_nasal'
  is_catchall  INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE sessions ADD COLUMN mask_id TEXT REFERENCES masks(id);
ALTER TABLE sessions ADD COLUMN notes  TEXT;

-- ─── ResMed ──────────────────────────────────────────────────────────────────
INSERT INTO masks (id, manufacturer, name, mask_type, is_catchall, sort_order) VALUES
  ('resmed_airfit_f40',         'ResMed', 'AirFit F40',             'full_face',    0, 10),
  ('resmed_airfit_f20',         'ResMed', 'AirFit F20',             'full_face',    0, 20),
  ('resmed_airfit_f20_her',     'ResMed', 'AirFit F20 for Her',     'full_face',    0, 21),
  ('resmed_airfit_f10',         'ResMed', 'AirFit F10',             'full_face',    0, 22),
  ('resmed_airfit_f30',         'ResMed', 'AirFit F30',             'full_face',    0, 30),
  ('resmed_airfit_f30i',        'ResMed', 'AirFit F30i',            'full_face',    0, 31),
  ('resmed_airfit_n20',         'ResMed', 'AirFit N20',             'nasal',        0, 40),
  ('resmed_airfit_n20_her',     'ResMed', 'AirFit N20 for Her',     'nasal',        0, 41),
  ('resmed_airfit_n30',         'ResMed', 'AirFit N30',             'nasal',        0, 42),
  ('resmed_airfit_n30i',        'ResMed', 'AirFit N30i',            'nasal',        0, 43),
  ('resmed_airfit_p10',         'ResMed', 'AirFit P10',             'nasal_pillow', 0, 50),
  ('resmed_airfit_p10_her',     'ResMed', 'AirFit P10 for Her',     'nasal_pillow', 0, 51),
  ('resmed_airfit_p30i',        'ResMed', 'AirFit P30i',            'nasal_pillow', 0, 52),
  ('resmed_airfit_x30i',        'ResMed', 'AirFit X30i',            'nasal_pillow', 0, 53),
  ('resmed_airtouch_f20',       'ResMed', 'AirTouch F20',           'full_face',    0, 60),
  ('resmed_airtouch_f20_her',   'ResMed', 'AirTouch F20 for Her',   'full_face',    0, 61),
  ('resmed_airtouch_f30i_comf', 'ResMed', 'AirTouch F30i Comfort',  'full_face',    0, 62),
  ('resmed_airtouch_f30i_clr',  'ResMed', 'AirTouch F30i Clear',    'full_face',    0, 63),
  ('resmed_airtouch_n20',       'ResMed', 'AirTouch N20',           'nasal',        0, 70),
  ('resmed_airtouch_n20_her',   'ResMed', 'AirTouch N20 for Her',   'nasal',        0, 71),
  ('resmed_airtouch_n30i',      'ResMed', 'AirTouch N30i',          'nasal',        0, 72),
  ('resmed_mirage_quattro',     'ResMed', 'Mirage Quattro',         'full_face',    0, 80),
  ('resmed_mirage_activa_lt',   'ResMed', 'Mirage Activa LT',       'nasal',        0, 81),
  ('resmed_mirage_fx',          'ResMed', 'Mirage FX',              'nasal',        0, 82),
  ('resmed_swift_fx',           'ResMed', 'Swift FX',               'nasal_pillow', 0, 83),
  ('resmed_swift_fx_bella',     'ResMed', 'Swift FX Bella',         'nasal_pillow', 0, 84),
  ('resmed_pixi',               'ResMed', 'Pixi Pediatric',         'full_face',    0, 85);

-- ─── Fisher & Paykel ─────────────────────────────────────────────────────────
INSERT INTO masks (id, manufacturer, name, mask_type, is_catchall, sort_order) VALUES
  ('fp_nova',         'Fisher & Paykel', 'Nova',            'nasal_pillow', 0, 110),
  ('fp_nova_micro',   'Fisher & Paykel', 'Nova Micro',      'nasal_pillow', 0, 111),
  ('fp_solo',         'Fisher & Paykel', 'Solo',            'nasal_pillow', 0, 112),
  ('fp_evora_nasal',  'Fisher & Paykel', 'Evora Nasal',     'nasal',        0, 120),
  ('fp_evora_ff',     'Fisher & Paykel', 'Evora Full Face', 'full_face',    0, 121),
  ('fp_vitera',       'Fisher & Paykel', 'Vitera',          'full_face',    0, 122),
  ('fp_eson',         'Fisher & Paykel', 'Eson',            'nasal',        0, 123),
  ('fp_eson_2',       'Fisher & Paykel', 'Eson 2',          'nasal',        0, 124),
  ('fp_brevida',      'Fisher & Paykel', 'Brevida',         'nasal_pillow', 0, 125),
  ('fp_simplus',      'Fisher & Paykel', 'Simplus',         'full_face',    0, 126),
  ('fp_forma',        'Fisher & Paykel', 'Forma',           'full_face',    0, 127),
  ('fp_flexifit_431', 'Fisher & Paykel', 'FlexiFit 431',    'full_face',    0, 128),
  ('fp_flexifit_432', 'Fisher & Paykel', 'FlexiFit 432',    'full_face',    0, 129),
  ('fp_opus_360',     'Fisher & Paykel', 'Opus 360',        'oral_nasal',   0, 130),
  ('fp_pilairo_q',    'Fisher & Paykel', 'Pilairo Q',       'nasal_pillow', 0, 131),
  ('fp_zest',         'Fisher & Paykel', 'Zest',            'nasal',        0, 132),
  ('fp_zest_q',       'Fisher & Paykel', 'Zest Q',          'nasal',        0, 133);

-- ─── Philips Respironics ─────────────────────────────────────────────────────
INSERT INTO masks (id, manufacturer, name, mask_type, is_catchall, sort_order) VALUES
  ('pr_dreamwear_ff',    'Philips Respironics', 'DreamWear Full Face',             'full_face',    0, 210),
  ('pr_dreamwear_nasal', 'Philips Respironics', 'DreamWear Nasal',                 'nasal',        0, 211),
  ('pr_dreamwear_snp',   'Philips Respironics', 'DreamWear Silicone Nasal Pillow', 'nasal_pillow', 0, 212),
  ('pr_dreamwisp',       'Philips Respironics', 'DreamWisp Nasal',                 'nasal',        0, 213),
  ('pr_wisp',            'Philips Respironics', 'Wisp Nasal',                      'nasal',        0, 214),
  ('pr_comfortgel_blue', 'Philips Respironics', 'ComfortGel Blue Nasal',           'nasal',        0, 215),
  ('pr_nuance_pro',      'Philips Respironics', 'Nuance Pro Gel Nasal Pillow',     'nasal_pillow', 0, 216),
  ('pr_amara_view',      'Philips Respironics', 'Amara View Full Face',            'full_face',    0, 217);

-- ─── React Health ────────────────────────────────────────────────────────────
INSERT INTO masks (id, manufacturer, name, mask_type, is_catchall, sort_order) VALUES
  ('rh_numa_ff',      'React Health', 'Numa Full Face',       'full_face',    0, 310),
  ('rh_rio_ii_ff',    'React Health', 'Rio II Full Face',     'full_face',    0, 311),
  ('rh_rio_ii_np',    'React Health', 'Rio II Nasal Pillows', 'nasal_pillow', 0, 312),
  ('rh_siesta_ff',    'React Health', 'Siesta Full Face',     'full_face',    0, 313),
  ('rh_siesta_2_ff',  'React Health', 'Siesta 2 Full Face',   'full_face',    0, 314),
  ('rh_siesta_nasal', 'React Health', 'Siesta Nasal',         'nasal',        0, 315),
  ('rh_viva_nasal',   'React Health', 'Viva Nasal',           'nasal',        0, 316);

-- ─── Bleep ───────────────────────────────────────────────────────────────────
INSERT INTO masks (id, manufacturer, name, mask_type, is_catchall, sort_order) VALUES
  ('bleep_eclipse',   'Bleep', 'Eclipse CPAP Mask Starter Kit', 'nasal', 0, 410),
  ('bleep_dreamport', 'Bleep', 'DreamPort CPAP Mask',           'nasal', 0, 411);

-- ─── Catch-alls (always shown last) ──────────────────────────────────────────
INSERT INTO masks (id, manufacturer, name, mask_type, is_catchall, sort_order) VALUES
  ('other_ff', 'Other', 'Other (Full Face)',    'full_face',    1, 900),
  ('other_n',  'Other', 'Other (Nasal)',        'nasal',        1, 901),
  ('other_np', 'Other', 'Other (Nasal Pillow)', 'nasal_pillow', 1, 902),
  ('other_on', 'Other', 'Other (Oral-Nasal)',   'oral_nasal',   1, 903);
