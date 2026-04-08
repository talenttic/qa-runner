import React, { useState } from "react";

interface OnboardingStep {
  title: string;
  description: string;
  target?: string; // CSS selector for highlighting
}

const onboardingSteps: OnboardingStep[] = [
  {
    title: "Welcome to QA Runner",
    description: "QA Runner helps you perform manual and AI-assisted testing for your applications. Let's take a quick tour of the main features.",
  },
  {
    title: "Select Test Suites",
    description: "Choose from available test suites in your project. Each suite contains test cases organized by features.",
    target: "[data-onboarding='suite-selector']",
  },
  {
    title: "Manual Testing Mode",
    description: "Execute tests manually by checking off steps and recording results. Perfect for exploratory testing.",
    target: "[data-onboarding='mode-toggle']",
  },
  {
    title: "AI-Assisted Testing",
    description: "Let AI execute tests automatically and generate detailed reports. Great for regression testing.",
    target: "[data-onboarding='ai-mode']",
  },
  {
    title: "Test Generation",
    description: "Generate new test cases from natural language descriptions or existing code patterns.",
    target: "[data-onboarding='generate-tests']",
  },
  {
    title: "Validation & Reports",
    description: "Check your test suite for common issues and generate comprehensive test reports.",
    target: "[data-onboarding='validation']",
  },
];

export const OnboardingModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Allow animation to complete
  };

  const handleSkip = () => {
    handleClose();
  };

  if (!isVisible) return null;

  const step = onboardingSteps[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-surface-200 bg-surface-100 p-6 shadow-soft dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">
            {step.title}
          </h2>
          <button
            onClick={handleSkip}
            className="text-ink-400 hover:text-ink-600 dark:text-slate-400 dark:hover:text-slate-200"
            aria-label="Skip tutorial"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mb-6 text-sm text-ink-600 dark:text-slate-300">
          {step.description}
        </p>

        {/* Progress indicator */}
        <div className="mb-6 flex space-x-2">
          {onboardingSteps.map((_, index) => (
            <div
              key={index}
              className={`h-2 flex-1 rounded-full ${
                index <= currentStep
                  ? "bg-brand-500"
                  : "bg-surface-200 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            {currentStep === onboardingSteps.length - 1 ? "Get Started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const useOnboarding = () => {
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const hasSeenOnboarding = localStorage.getItem("qa-runner:onboarding-seen");
    return !hasSeenOnboarding;
  });

  const closeOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem("qa-runner:onboarding-seen", "true");
  };

  return { showOnboarding, closeOnboarding };
};