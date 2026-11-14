import { toApiRequest, toResponse } from "../../http";
import { getServer } from "../../server";

export const dynamic = "force-dynamic";

const forward = async (req: Request): Promise<Response> => toResponse(await (await getServer()).handle(await toApiRequest(req)));

export const GET = forward;
export const POST = forward;
