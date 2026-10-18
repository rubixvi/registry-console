import 'server-only'

import { hubPrivacy, hubTags } from '@/lib/registry/dockerhub'
import { hubRequest } from '@/lib/registry/dockerhub-client'
import { imageDetails } from '@/lib/registry/image'
import { imageDigest } from '@/lib/registry/image-digest'
import { AppError } from '@/lib/security/error'
import { referenceName } from '@/lib/validation/registry'
import { tagSchema } from '@/lib/validation/response/dockerhub'
import { type ImageMetadata } from '@/types/image'
import { type RegistryRecord } from '@/types/registry'
import { imageCreated } from '@/utils/image-metadata'

export async function imageMetadata(
  registry: RegistryRecord,
  repository: string,
  reference: string,
  refresh = false
): Promise<ImageMetadata> {
  referenceName.parse(reference)
  const isPrivate = await hubPrivacy(registry, repository, refresh)

  if (registry.provider !== 'dockerhub' || reference.startsWith('sha256:')) {
    const details = await imageDetails(registry, repository, reference, refresh)

    return {
      isPrivate,
      digest: details.digest,
      created: details.created,
      pushedAt: null,
      runnable: details.platformDetails.length > 0,
    }
  }

  const path = `${hubTags(registry, repository)}/${encodeURIComponent(reference)}`
  const result = await hubRequest(registry, path, refresh)
  let body: unknown

  try {
    body = JSON.parse(result.text)
  } catch {
    throw new AppError(502, 'Docker Hub returned invalid tag metadata.')
  }

  const parsed = tagSchema.safeParse(body)

  if (!parsed.success || parsed.data.name !== reference) {
    throw new AppError(502, 'Docker Hub returned invalid tag metadata.')
  }

  const tag = parsed.data

  return {
    isPrivate,
    digest: tag.digest ?? (await imageDigest(registry, repository, reference)),
    created: null,
    pushedAt: imageCreated(tag.tag_last_pushed) ?? imageCreated(tag.last_updated),
    runnable:
      (!tag.content_type || tag.content_type === 'image') &&
      Boolean(
        tag.images?.some(
          (image) =>
            image.os &&
            image.os !== 'unknown' &&
            image.architecture &&
            image.architecture !== 'unknown'
        )
      ),
  }
}
