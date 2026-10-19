"use client";

import AuthenticatedApp from "@/components/app/AuthenticatedApp";

import { CaptureCircleInvitation } from "@/components/circles/CircleExperience";

export default function Home() {
  return <><CaptureCircleInvitation /><AuthenticatedApp /></>;
}
