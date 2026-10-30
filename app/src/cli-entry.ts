// Entry of the command line bundle (dist-cli/level7.cjs). Run it with node, or
// through the Windows program: "LEVEL7 CAD.exe" --cli --model ... --out ...
import { run } from "./cli";

export { run };

declare const require: { main: unknown } | undefined;
declare const module: unknown;
if (typeof require !== "undefined" && require.main === module) process.exitCode = run(process.argv.slice(2));
