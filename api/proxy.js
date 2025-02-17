/** @readonly HyperDX query API endpoint */
const hdxQueryUrl = 'https://api.hyperdx.io/api/v1/charts/series';

/**
 * @param {Request} req
 * @param {Response} res
 */
export default async function handler(req, res) {
  try {
    const response = await fetch(hdxQueryUrl, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
