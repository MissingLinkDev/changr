const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export async function onRequest(context: any) {
  const request = context.request;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
      status: 200,
    });
  }

  const response = await context.next();
  const modifiedResponse = new Response(response.body, response);

  Object.keys(corsHeaders).forEach((header) => {
    modifiedResponse.headers.set(header, corsHeaders[header as keyof typeof corsHeaders]);
  });

  return modifiedResponse;
}
