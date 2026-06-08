import { jsonOk } from "@/app/api/_lib/http";
import { listProjects } from "@/app/api/_lib/services/project.service";
import { getVoiceBackendStatus } from "@/app/api/_lib/services/voice/voice-transcription.service";

export async function GET() {
  const [voiceBackendStatus, projects] = await Promise.all([
    getVoiceBackendStatus(),
    listProjects(),
  ]);

  return jsonOk({
    ...voiceBackendStatus,
    projects: projects.map((project) => ({
      id: project.id,
      title: project.title,
    })),
  });
}
