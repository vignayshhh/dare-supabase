"use client";

import { useState } from "react";
import { ArrowLeft, Check, Save, Sparkles } from "lucide-react";
import {
  DEFAULT_STICKMAN_CUSTOMIZATION,
  STICKMAN_ACCESSORY_OPTIONS,
  STICKMAN_ANIMATION_OPTIONS,
  stickmanCustomizationService,
  type StickmanAccessoryId,
  type StickmanAnimationId,
  type StickmanCustomization,
} from "../../services/stickmanCustomizationService";
import styles from "./StickmanCustomizationScreen.module.css";

type StickmanCustomizationScreenProps = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  initialCustomization?: StickmanCustomization;
  onBack: () => void;
  onSaved: (customization: StickmanCustomization) => void;
};

export function StickmanCustomizationScreen({
  userId,
  name,
  avatarUrl,
  initialCustomization = DEFAULT_STICKMAN_CUSTOMIZATION,
  onBack,
  onSaved,
}: StickmanCustomizationScreenProps) {
  const [draft, setDraft] = useState<StickmanCustomization>(initialCustomization);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const accessory = STICKMAN_ACCESSORY_OPTIONS.find((item) => item.id === draft.accessoryId) ?? STICKMAN_ACCESSORY_OPTIONS[0];
  const animation = STICKMAN_ANIMATION_OPTIONS.find((item) => item.id === draft.animationId) ?? STICKMAN_ANIMATION_OPTIONS[0];

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await stickmanCustomizationService.save(userId, draft);
      onSaved(saved);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your stickman.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={onBack} aria-label="Back to profile">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className={styles.eyebrow}>profile lab</p>
          <h1>Build your stickman</h1>
        </div>
        <span className={styles.headerSpark}><Sparkles size={18} /></span>
      </header>

      <main className={styles.content}>
        <section className={styles.previewCard} aria-label="Stickman preview">
          <div className={styles.previewMeta}>
            <span>live preview</span>
            <span className={styles.previewDot} />
          </div>
          <div className={`${styles.figure} ${styles[`animation-${draft.animationId}`]}`}>
            <div className={`${styles.accessory} ${styles[`accessory-${draft.accessoryId}`]}`} aria-hidden="true">
              {accessory.glyph}
            </div>
            <div className={styles.head}>
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{name.slice(0, 2).toUpperCase()}</span>}
            </div>
            <div className={styles.body}>
              <i className={styles.spine} />
              <i className={`${styles.limb} ${styles.armLeft}`} />
              <i className={`${styles.limb} ${styles.armRight}`} />
              <i className={`${styles.limb} ${styles.legLeft}`} />
              <i className={`${styles.limb} ${styles.legRight}`} />
            </div>
          </div>
          <div className={styles.previewCaption}>
            <strong>{name}</strong>
            <span>{accessory.label} · {animation.label}</span>
          </div>
        </section>

        <section className={styles.optionSection}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>01 / add a little lore</p><h2>Accessories</h2></div>
            <span>10 options</span>
          </div>
          <div className={styles.optionGrid}>
            {STICKMAN_ACCESSORY_OPTIONS.map((option) => {
              const selected = draft.accessoryId === option.id;
              return (
                <button
                  type="button"
                  key={option.id}
                  className={`${styles.option} ${selected ? styles.selected : ""}`}
                  onClick={() => setDraft((current) => ({ ...current, accessoryId: option.id as StickmanAccessoryId }))}
                  aria-pressed={selected}
                >
                  <span className={styles.optionGlyph}>{option.glyph}</span>
                  <span>{option.label}</span>
                  {selected && <Check size={15} className={styles.check} />}
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.optionSection}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>02 / choose your entrance</p><h2>Default animation</h2></div>
            <span>10 options</span>
          </div>
          <div className={styles.animationList}>
            {STICKMAN_ANIMATION_OPTIONS.map((option) => {
              const selected = draft.animationId === option.id;
              return (
                <button
                  type="button"
                  key={option.id}
                  className={`${styles.animationOption} ${selected ? styles.selected : ""}`}
                  onClick={() => setDraft((current) => ({ ...current, animationId: option.id as StickmanAnimationId }))}
                  aria-pressed={selected}
                >
                  <span className={`${styles.miniFigure} ${styles[`animation-${option.id}`]}`}><span /></span>
                  <span className={styles.animationCopy}><strong>{option.label}</strong><small>{option.detail}</small></span>
                  {selected && <Check size={15} className={styles.check} />}
                </button>
              );
            })}
          </div>
        </section>

        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="button" className={styles.saveButton} onClick={save} disabled={saving}>
          <Save size={17} />
          {saving ? "Saving your vibe…" : "Save my stickman"}
        </button>
        <p className={styles.note}>Friends see your saved setup when they visit your profile.</p>
      </main>
    </div>
  );
}
