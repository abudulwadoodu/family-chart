// Fully mocked - isolated behind this single function so swapping in a real
// GET /api/admin/analytics call later only touches this file.
function mockSeries(base, variance, length = 12) {
  return Array.from({ length }, (_, i) => Math.max(0, Math.round(base + Math.sin(i / 2) * variance + i * (variance / length))));
}

export function createAnalyticsState() {
  return { metrics: [], loading: false };
}

export async function loadAnalytics(state, render) {
  state.admin.analytics.loading = true;
  render();

  state.admin.analytics.metrics = [
    { title: 'User Registrations', total: 482, points: mockSeries(20, 10) },
    { title: 'Active Users', total: 1290, points: mockSeries(80, 30) },
    { title: 'Trees Created', total: 214, points: mockSeries(10, 6) },
    { title: 'Members Added', total: 3860, points: mockSeries(180, 90) },
    { title: 'Photos Uploaded', total: 967, points: mockSeries(40, 25) },
    { title: 'Support Ticket Trends', total: 58, points: mockSeries(3, 4) },
  ];
  state.admin.analytics.loading = false;
  render();
}
