import { jsonOk } from "@/app/api/_lib/http";
import { listProjects } from "@/app/api/_lib/services/project.service";
import { getVoiceBackendStatus } from "@/app/api/_lib/services/voice/voice-transcription.service";

export async function GET() {
  console.info("[openPinna][voice] status route requested");
  const [projects, voiceBackendStatus] = await Promise.all([
    listProjects(),
    getVoiceBackendStatus(),
  ]);

  console.info("[openPinna][voice] status route resolved", {
    projectCount: projects.length,
    openAiConfigured: voiceBackendStatus.openAiConfigured,
    openAiReachable: voiceBackendStatus.openAiReachable,
    message: voiceBackendStatus.message,
  });

  return jsonOk({
    ...voiceBackendStatus,
    projectCount: projects.length,
    projects: projects.map((project) => ({
      id: project.id,
      title: project.title,
    })),
  });
}
