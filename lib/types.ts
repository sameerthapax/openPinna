import type { Prisma } from "@prisma/client";

export type ProjectTreeRecord = Prisma.ProjectGetPayload<{
  include: {
    sessions: {
      include: {
        notes: {
          select: {
            id: true;
            title: true;
          };
        };
      };
    };
  };
}>;

export type StructuredNoteDraft = {
  structuredSummary: string;
  usefulness: string;
  purpose: string;
};
