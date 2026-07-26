import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MotionConfig } from "motion/react";
import { ErrorBoundary } from "./app/ErrorBoundary";
import "./styles/tokens.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
  <MotionConfig reducedMotion="user"><App /></MotionConfig>
    </ErrorBoundary>
  </StrictMode>
);
