/**
 * Fiken User, companies, inbox, EHF, projects and time tracking
 */

import { FikenBaseService, FikenConfig } from './fiken-base.service';
import {
  Activity,
  ActivityQueryParams,
  ActivityRequest,
  Company,
  CompanyQueryParams,
  EhfDocument,
  EhfQueryParams,
  FikenApiResponse,
  InboxDocument,
  InboxQueryParams,
  Project,
  ProjectQueryParams,
  ProjectRequest,
  TimeEntry,
  TimeEntryInvoiceDraftRequest,
  TimeEntryQueryParams,
  TimeEntryRequest,
  TimeUser,
  TimeUserQueryParams,
  UpdateActivityRequest,
  UpdateProjectRequest,
  UpdateTimeEntryRequest,
  UserInfo,
} from '../types/fiken.types';

export class FikenWorkspaceService extends FikenBaseService {
  constructor(config: FikenConfig) {
    super(config);
  }

  // ========== USER & COMPANIES ==========

  /**
   * GET /user
   */
  async getUser(): Promise<FikenApiResponse<UserInfo>> {
    return this.get<UserInfo>('/user');
  }

  /**
   * GET /companies
   */
  async getCompanies(params?: CompanyQueryParams): Promise<FikenApiResponse<Company[]>> {
    return this.get<Company[]>('/companies', params);
  }

  /**
   * GET /companies/{companySlug}
   */
  async getCompany(companySlug: string): Promise<FikenApiResponse<Company>> {
    this.validateCompanySlug(companySlug);
    return this.get<Company>(`/companies/${companySlug}`);
  }

  // ========== INBOX & EHF ==========

  /**
   * GET /companies/{companySlug}/inbox
   */
  async getInboxDocuments(companySlug: string, params?: InboxQueryParams): Promise<FikenApiResponse<InboxDocument[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<InboxDocument[]>(`/companies/${companySlug}/inbox`, params);
  }

  /**
   * GET /companies/{companySlug}/inbox/{inboxDocumentId}
   */
  async getInboxDocument(companySlug: string, inboxDocumentId: number): Promise<FikenApiResponse<InboxDocument>> {
    this.validateCompanySlug(companySlug);
    this.validateId(inboxDocumentId, 'inboxDocumentId');
    return this.get<InboxDocument>(`/companies/${companySlug}/inbox/${inboxDocumentId}`);
  }

  /**
   * GET /companies/{companySlug}/ehf
   */
  async getEhfDocuments(companySlug: string, params?: EhfQueryParams): Promise<FikenApiResponse<EhfDocument[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<EhfDocument[]>(`/companies/${companySlug}/ehf`, params);
  }

  /**
   * GET /companies/{companySlug}/ehf/{ehfDocumentId}
   */
  async getEhfDocument(companySlug: string, ehfDocumentId: number): Promise<FikenApiResponse<EhfDocument>> {
    this.validateCompanySlug(companySlug);
    this.validateId(ehfDocumentId, 'ehfDocumentId');
    return this.get<EhfDocument>(`/companies/${companySlug}/ehf/${ehfDocumentId}`);
  }

  // ========== PROJECTS ==========

  /**
   * GET /companies/{companySlug}/projects
   */
  async getProjects(companySlug: string, params?: ProjectQueryParams): Promise<FikenApiResponse<Project[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<Project[]>(`/companies/${companySlug}/projects`, params);
  }

  /**
   * GET /companies/{companySlug}/projects/{projectId}
   */
  async getProject(companySlug: string, projectId: number): Promise<FikenApiResponse<Project>> {
    this.validateCompanySlug(companySlug);
    this.validateId(projectId, 'projectId');
    return this.get<Project>(`/companies/${companySlug}/projects/${projectId}`);
  }

  /**
   * POST /companies/{companySlug}/projects
   */
  async createProject(companySlug: string, project: ProjectRequest): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    return this.post<void>(`/companies/${companySlug}/projects`, project);
  }

  /**
   * PATCH /companies/{companySlug}/projects/{projectId}
   */
  async updateProject(
    companySlug: string,
    projectId: number,
    project: UpdateProjectRequest
  ): Promise<FikenApiResponse<Project | void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(projectId, 'projectId');
    return this.patch<Project | void>(`/companies/${companySlug}/projects/${projectId}`, project);
  }

  // ========== TIME ENTRIES ==========

  /**
   * GET /companies/{companySlug}/timeEntries
   */
  async getTimeEntries(companySlug: string, params?: TimeEntryQueryParams): Promise<FikenApiResponse<TimeEntry[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<TimeEntry[]>(`/companies/${companySlug}/timeEntries`, params);
  }

  /**
   * GET /companies/{companySlug}/timeEntries/{timeEntryId}
   */
  async getTimeEntry(companySlug: string, timeEntryId: number): Promise<FikenApiResponse<TimeEntry>> {
    this.validateCompanySlug(companySlug);
    this.validateId(timeEntryId, 'timeEntryId');
    return this.get<TimeEntry>(`/companies/${companySlug}/timeEntries/${timeEntryId}`);
  }

  /**
   * POST /companies/{companySlug}/timeEntries
   */
  async createTimeEntry(companySlug: string, timeEntry: TimeEntryRequest): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    return this.post<void>(`/companies/${companySlug}/timeEntries`, timeEntry);
  }

  /**
   * PATCH /companies/{companySlug}/timeEntries/{timeEntryId}
   */
  async updateTimeEntry(
    companySlug: string,
    timeEntryId: number,
    timeEntry: UpdateTimeEntryRequest
  ): Promise<FikenApiResponse<TimeEntry | void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(timeEntryId, 'timeEntryId');
    return this.patch<TimeEntry | void>(`/companies/${companySlug}/timeEntries/${timeEntryId}`, timeEntry);
  }

  /**
   * Creates an invoice draft from time entries; the Location header points at the new invoice draft
   * POST /companies/{companySlug}/timeEntries/createInvoiceDraft
   */
  async createInvoiceDraftFromTimeEntries(
    companySlug: string,
    request: TimeEntryInvoiceDraftRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    return this.post<void>(`/companies/${companySlug}/timeEntries/createInvoiceDraft`, request);
  }

  // ========== ACTIVITIES ==========

  /**
   * GET /companies/{companySlug}/activities
   */
  async getActivities(companySlug: string, params?: ActivityQueryParams): Promise<FikenApiResponse<Activity[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<Activity[]>(`/companies/${companySlug}/activities`, params);
  }

  /**
   * GET /companies/{companySlug}/activities/{activityId}
   */
  async getActivity(companySlug: string, activityId: number): Promise<FikenApiResponse<Activity>> {
    this.validateCompanySlug(companySlug);
    this.validateId(activityId, 'activityId');
    return this.get<Activity>(`/companies/${companySlug}/activities/${activityId}`);
  }

  /**
   * POST /companies/{companySlug}/activities
   */
  async createActivity(companySlug: string, activity: ActivityRequest): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    return this.post<void>(`/companies/${companySlug}/activities`, activity);
  }

  /**
   * PATCH /companies/{companySlug}/activities/{activityId}
   */
  async updateActivity(
    companySlug: string,
    activityId: number,
    activity: UpdateActivityRequest
  ): Promise<FikenApiResponse<Activity | void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(activityId, 'activityId');
    return this.patch<Activity | void>(`/companies/${companySlug}/activities/${activityId}`, activity);
  }

  // ========== TIME USERS ==========

  /**
   * GET /companies/{companySlug}/timeUsers
   */
  async getTimeUsers(companySlug: string, params?: TimeUserQueryParams): Promise<FikenApiResponse<TimeUser[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<TimeUser[]>(`/companies/${companySlug}/timeUsers`, params);
  }

  /**
   * GET /companies/{companySlug}/timeUsers/{timeUserId}
   */
  async getTimeUser(companySlug: string, timeUserId: number): Promise<FikenApiResponse<TimeUser>> {
    this.validateCompanySlug(companySlug);
    this.validateId(timeUserId, 'timeUserId');
    return this.get<TimeUser>(`/companies/${companySlug}/timeUsers/${timeUserId}`);
  }
}
