import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = normalize(process.cwd());
const port = Number(process.env.PORT ?? 4174);
const types: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function fileFor(url = "/") {
  const path = url === "/" ? "/examples/demo/index.html" : url;
  const file = normalize(join(root, path));
  return file.startsWith(root) ? file : "";
}

createServer((request, response) => {
  const file = fileFor(request.url?.split("?")[0]);
  if (!file || !existsSync(file)) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, {
    "content-type": types[extname(file)] ?? "text/plain; charset=utf-8",
  });
  createReadStream(file).pipe(response);
}).listen(port, () => {
  console.log(`Feelable Materials demo: http://localhost:${port}/`);
});
