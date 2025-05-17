import request from 'supertest';
import app from '../src/app.js';

describe('GET /healthz', () => {
  it('should return status ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
}); 