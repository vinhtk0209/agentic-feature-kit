// CONTRACT: FE_ONLY — endpoints inferred; see
// docs/components/US-AD-095-ProgressReports/US-AD-095-ProgressReports.full.http
import { camelCaseObject, snakeCaseObject, getConfig } from '@edx/frontend-platform';
import { getHttpClient } from '@edx/frontend-platform/auth';
import type {
  AssessmentAnalytics,
  AssessmentFilterValue,
  ExportParams,
  ExportResult,
  LearnerMetric,
  ProgressOverview,
} from './types';
import {
  mapAssessmentAnalytics,
  mapExportResult,
  mapLearnerMetric,
  mapProgressOverview,
} from './transform';
import {
  USE_MOCK,
  getMockAnalytics,
  getMockLearners,
  getMockOverview,
} from './mockData';

type AxiosLike = { response?: { data?: { message?: string } } };
export const parseApiError = (
  err: unknown,
  fallback: string,
): string => (err as AxiosLike)?.response?.data?.message ?? fallback;

function getProgressReportsBaseUrl(classId: number): string {
  return `${getConfig().API_BASE_URL}/api/admin/v1/classes/${classId}/progress-reports`;
}

export const getOverviewUrl = (classId: number): string => `${getProgressReportsBaseUrl(classId)}/overview/`;
export const getAnalyticsUrl = (classId: number, assessmentId: AssessmentFilterValue): string => `${getProgressReportsBaseUrl(classId)}/assessment-analytics/?assessment_id=${assessmentId}`;
export const getLearnersUrl = (classId: number, assessmentId: AssessmentFilterValue): string => `${getProgressReportsBaseUrl(classId)}/learners/?assessment_id=${assessmentId}`;
export const getExportUrl = (classId: number): string => `${getProgressReportsBaseUrl(classId)}/export/`;

const delay = <T>(
  value: T, ms = 300,
): Promise<T> => new Promise((resolve) => { setTimeout(() => resolve(value), ms); });

export async function getProgressOverview(classId: number): Promise<ProgressOverview> {
  if (USE_MOCK) {
    return delay(getMockOverview());
  }
  try {
    const { data } = await getHttpClient().get(getOverviewUrl(classId));
    return mapProgressOverview(camelCaseObject(data));
  } catch (err) {
    throw new Error(parseApiError(err, 'Failed to load progress overview'));
  }
}

export async function getAssessmentAnalytics(
  classId: number,
  assessmentId: AssessmentFilterValue,
): Promise<AssessmentAnalytics> {
  if (USE_MOCK) {
    return delay(getMockAnalytics(assessmentId));
  }
  try {
    const { data } = await getHttpClient().get(getAnalyticsUrl(classId, assessmentId));
    return mapAssessmentAnalytics(camelCaseObject(data));
  } catch (err) {
    throw new Error(parseApiError(err, 'Failed to load assessment analytics'));
  }
}

export async function getLearnerMetrics(
  classId: number,
  assessmentId: AssessmentFilterValue,
): Promise<LearnerMetric[]> {
  if (USE_MOCK) {
    return delay(getMockLearners(classId, assessmentId));
  }
  try {
    const { data } = await getHttpClient().get(getLearnersUrl(classId, assessmentId));
    const camel = camelCaseObject(data);
    return (camel.learners ?? camel.results ?? []).map(mapLearnerMetric);
  } catch (err) {
    throw new Error(parseApiError(err, 'Failed to load learner metrics'));
  }
}

export async function postExportReport(
  classId: number,
  params: ExportParams,
): Promise<ExportResult> {
  if (USE_MOCK) {
    return delay({ fileUrl: `mock://export/class-${classId}.${params.format}`, format: params.format });
  }
  try {
    const payload = { format: params.format, assessmentId: params.assessmentId };
    const { data } = await getHttpClient().post(getExportUrl(classId), snakeCaseObject(payload));
    return mapExportResult(camelCaseObject(data));
  } catch (err) {
    throw new Error(parseApiError(err, 'Failed to export report'));
  }
}
