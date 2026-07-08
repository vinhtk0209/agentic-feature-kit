// Domain types for Progress & Reports (US-AD-095). No `any`.

export type LearnerAssessmentStatus = 'Completed' | 'Incomplete' | 'Not Attempted';

// 'ALL' is the aggregated (default) filter value; otherwise a specific exam id.
export type AssessmentFilterValue = string; // 'ALL' | exam id

export interface ExamOption {
  id: string;
  name: string;
}

// Endpoint 1: overview (KPIs + exam list + assessment availability)
export interface ProgressOverview {
  completionRate: number; // 0-100 class-level (learning completion only); 0 when totalEnrolled=0 (BR1)
  attendanceRate: number; // 0-100 (BR2)
  totalLearners: number;
  totalEnrolled: number;
  hasPublishedAssessment: boolean; // false → hide filter + all assessment components (AC4)
  exams: ExamOption[]; // published + assigned assessments only
}

// Endpoint 2: assessment analytics
export interface StatusBreakdown {
  passed: number;
  incomplete: number;
  notAttempted: number;
  totalLearners: number; // donut center value
}

export interface ScoreBucket {
  label: string; // e.g. '5s', '10s', '15s', '>15s'
  min: number;
  max: number | null; // null = open-ended top bucket
  count: number;
}

export interface OverTimePoint {
  date: string; // YYYY-MM-DD
  count: number; // submissions that day (BR6)
}

export interface AssessmentAnalytics {
  assessmentId: AssessmentFilterValue; // 'ALL' or specific exam id
  hasSubmissions: boolean; // false → hide charts + empty state (AC7)
  status: StatusBreakdown;
  scoreDistribution: ScoreBucket[];
  overTime: OverTimePoint[];
}

// Endpoint 3: learner detail metrics
export interface LearnerScore {
  actual: number;
  max: number;
}

export interface LearnerMetric {
  id: string;
  no: number;
  learnerId: string;
  learnerName: string;
  progressPct: number; // learner-level completion % (distinct from class completionRate)
  attendancePct: number;
  score: LearnerScore | null; // null → display '—' (BR5)
  assessmentStatus: LearnerAssessmentStatus;
  atRisk: boolean; // informational signal (BR7)
  assessmentDetailUrl: string; // nav target for learner-name click (AC17); in-class scope
}

// Endpoint 4: export
export type ExportFormat = 'csv' | 'pdf';

export interface ExportResult {
  fileUrl: string;
  format: ExportFormat;
}

export interface ExportParams {
  format: ExportFormat;
  assessmentId: AssessmentFilterValue;
}
