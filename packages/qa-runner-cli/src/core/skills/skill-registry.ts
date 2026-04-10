import type {
  AiAutoTesterSkill,
  E2EScaffoldSkill,
  FlakinessDetectorSkill,
  ManualGuideSkill,
  SelfHealingSkill,
  SkillsConfig,
  SkillToggle,
} from "./types.js";

export type SkillRegistry = {
  manualGuide?: ManualGuideSkill;
  e2eScaffold?: E2EScaffoldSkill;
  selfHealing?: SelfHealingSkill;
  aiAutoTester?: AiAutoTesterSkill;
  flakinessDetector?: FlakinessDetectorSkill;
};

export type SkillRegistryOptions = {
  config?: SkillsConfig;
  manualGuide?: ManualGuideSkill;
  e2eScaffold?: E2EScaffoldSkill;
  selfHealing?: SelfHealingSkill;
  aiAutoTester?: AiAutoTesterSkill;
  flakinessDetector?: FlakinessDetectorSkill;
};

const isEnabled = (toggle: SkillToggle | undefined, defaultValue: boolean): boolean => {
  return toggle?.enabled ?? defaultValue;
};

const isExplicitlyEnabled = (toggle: SkillToggle | undefined): boolean => {
  return toggle?.enabled === true;
};

export const createSkillRegistry = (options: SkillRegistryOptions): SkillRegistry => {
  const config = options.config;
  const registry: SkillRegistry = {};

  if (options.manualGuide && isEnabled(config?.manualGuide, true)) {
    registry.manualGuide = options.manualGuide;
  }

  if (options.e2eScaffold && isEnabled(config?.e2eScaffold, true)) {
    registry.e2eScaffold = options.e2eScaffold;
  }

  if (options.selfHealing && isExplicitlyEnabled(config?.selfHealing)) {
    registry.selfHealing = options.selfHealing;
  }

  if (options.aiAutoTester && isExplicitlyEnabled(config?.aiAutoTester)) {
    registry.aiAutoTester = options.aiAutoTester;
  }

  if (options.flakinessDetector && isExplicitlyEnabled(config?.flakinessDetector)) {
    registry.flakinessDetector = options.flakinessDetector;
  }

  return registry;
};
