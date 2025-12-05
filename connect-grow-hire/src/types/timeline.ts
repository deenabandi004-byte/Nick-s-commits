export interface TimelinePhase {
  name: string;
  startMonth: string;
  endMonth: string;
  goals: string[];
  description: string;
}

export interface TimelineData {
  phases: TimelinePhase[];
}

export interface TimelineInputs {
  role: string;
  industry: string;
  startDate: string;
  targetDeadline: string;
  applicationCount: number;
}

