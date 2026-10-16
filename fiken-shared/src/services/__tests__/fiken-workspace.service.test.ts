/**
 * Unit tests for FikenWorkspaceService
 */

import { FikenWorkspaceService } from '../fiken-workspace.service';

global.fetch = jest.fn();

describe('FikenWorkspaceService', () => {
  let service: FikenWorkspaceService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const companySlug = 'test-company';
  const base = 'https://api.fiken.no/api/v2';

  beforeEach(() => {
    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockReset();
    service = new FikenWorkspaceService({ apiToken: 'test-token', baseUrl: base, enableLogging: false });
  });

  const mockResponse = (data: unknown, status = 200, extraHeaders: Record<string, string> = {}) => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
      headers: {
        get: (name: string) => {
          const lower = name.toLowerCase();
          if (lower === 'content-type') return 'application/json';
          if (lower === 'content-length') return data === undefined ? '0' : '100';
          const match = Object.entries(extraHeaders).find(([key]) => key.toLowerCase() === lower);
          return match ? match[1] : null;
        },
      },
    } as unknown as Response);
  };

  const lastCall = () => {
    const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    return { url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
  };

  describe('user and companies', () => {
    it('gets the user without a company slug', async () => {
      mockResponse({ name: 'Test', email: 'test@fiken.no' });

      const result = await service.getUser();

      expect(lastCall()).toMatchObject({ url: `${base}/user`, method: 'GET' });
      expect(result.data).toEqual({ name: 'Test', email: 'test@fiken.no' });
    });

    it('lists companies with query params', async () => {
      mockResponse([{ name: 'Co', slug: 'co' }]);

      await service.getCompanies({ page: 1, sortBy: 'name desc' });

      const { url, method } = lastCall();
      expect(method).toBe('GET');
      expect(url).toBe(`${base}/companies?page=1&sortBy=name+desc`);
    });

    it('gets one company by slug', async () => {
      mockResponse({ slug: companySlug });
      await service.getCompany(companySlug);
      expect(lastCall().url).toBe(`${base}/companies/${companySlug}`);
    });
  });

  describe('inbox and EHF', () => {
    it('lists inbox documents with filters', async () => {
      mockResponse([]);
      await service.getInboxDocuments(companySlug, { status: 'unused', name: 'faktura' });
      expect(lastCall().url).toBe(`${base}/companies/${companySlug}/inbox?status=unused&name=faktura`);
    });

    it('gets an EHF document by id', async () => {
      mockResponse({ ehfDocumentId: 7 });
      await service.getEhfDocument(companySlug, 7);
      expect(lastCall()).toMatchObject({ url: `${base}/companies/${companySlug}/ehf/7`, method: 'GET' });
    });
  });

  describe('projects', () => {
    it('creates a project and returns the Location header', async () => {
      const location = `${base}/companies/${companySlug}/projects/42`;
      mockResponse(undefined, 201, { Location: location });

      const project = { number: 'P1', name: 'Website', startDate: '2026-01-01' };
      const result = await service.createProject(companySlug, project);

      expect(lastCall()).toMatchObject({ url: `${base}/companies/${companySlug}/projects`, method: 'POST', body: project });
      expect(result.location).toBe(location);
    });

    it('updates a project with PATCH', async () => {
      mockResponse(undefined, 201);
      await service.updateProject(companySlug, 42, { completed: true });
      expect(lastCall()).toMatchObject({
        url: `${base}/companies/${companySlug}/projects/42`,
        method: 'PATCH',
        body: { completed: true },
      });
    });
  });

  describe('time tracking', () => {
    it('lists time entries with filters', async () => {
      mockResponse([]);
      await service.getTimeEntries(companySlug, { dateGe: '2026-01-01', invoiced: false, projectId: 3 });
      expect(lastCall().url).toBe(
        `${base}/companies/${companySlug}/timeEntries?dateGe=2026-01-01&invoiced=false&projectId=3`,
      );
    });

    it('creates a time entry', async () => {
      mockResponse(undefined, 201);
      const entry = { date: '2026-03-15', hours: 7.5, activityId: 1, timeUserId: 2 };
      await service.createTimeEntry(companySlug, entry);
      expect(lastCall()).toMatchObject({ url: `${base}/companies/${companySlug}/timeEntries`, method: 'POST', body: entry });
    });

    it('creates an invoice draft from time entries', async () => {
      mockResponse(undefined, 201);
      const request = { timeEntryIds: [1, 2], customerId: 9, daysUntilDueDate: 14 };
      await service.createInvoiceDraftFromTimeEntries(companySlug, request);
      expect(lastCall()).toMatchObject({
        url: `${base}/companies/${companySlug}/timeEntries/createInvoiceDraft`,
        method: 'POST',
        body: request,
      });
    });

    it('updates an activity with PATCH', async () => {
      mockResponse({ activityId: 5, name: 'Dev' });
      const result = await service.updateActivity(companySlug, 5, { name: 'Dev' });
      expect(lastCall()).toMatchObject({ url: `${base}/companies/${companySlug}/activities/5`, method: 'PATCH' });
      expect(result.data).toEqual({ activityId: 5, name: 'Dev' });
    });

    it('gets a time user by id', async () => {
      mockResponse({ timeUserId: 3 });
      await service.getTimeUser(companySlug, 3);
      expect(lastCall().url).toBe(`${base}/companies/${companySlug}/timeUsers/3`);
    });
  });

  describe('validation', () => {
    it('rejects an unsafe company slug before any request', async () => {
      await expect(service.getCompany('../user')).rejects.toThrow('Company slug may only contain');
      await expect(service.getProjects('')).rejects.toThrow('Company slug is required');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it.each([0, -1, 1.5, NaN])('rejects id %p', async (id) => {
      await expect(service.getTimeEntry(companySlug, id)).rejects.toThrow('timeEntryId is required and must be a positive integer');
      await expect(service.getInboxDocument(companySlug, id)).rejects.toThrow('inboxDocumentId');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
