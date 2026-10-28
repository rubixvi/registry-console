import { Row } from '@/components/registry/repository/row'
import { Namespace } from '@/components/registry/repository/tree'
import { ErrorMessage } from '@/components/shared/error-message'
import { Loading } from '@/components/shared/loading'
import { type useRegistryPage } from '@/hooks/registry/use-page'

type Props = {
  id: string
  state: ReturnType<typeof useRegistryPage>
  tree: boolean
}

export function Content({ id, state, tree }: Props) {
  if (state.isLoading) {
    return <Loading />
  }

  if (state.error) {
    return (
      <div className="p-5">
        <ErrorMessage message={state.error.message} />

        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          Check the connection settings and repository permissions. For large architecture searches,
          narrow the repository name first.
        </p>
      </div>
    )
  }

  if (tree) {
    return state.matches.length > 0 ? (
      <Namespace id={id} key={state.query} query={state.query} repositories={state.matches} />
    ) : (
      <p className="p-12 text-center text-sm text-muted-foreground">
        {state.query ? 'No matching repositories.' : 'No repositories found.'}
      </p>
    )
  }

  if (state.items.length > 0) {
    return (
      <ul className="divide-y">
        {state.items.map((name) => (
          <Row id={id} key={name} name={name} />
        ))}
      </ul>
    )
  }

  return (
    <p className="p-12 text-center text-sm text-muted-foreground">
      {state.query ? 'No matching repositories.' : 'No repositories found.'}
    </p>
  )
}
