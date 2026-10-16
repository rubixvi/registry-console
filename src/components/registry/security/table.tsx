import { SeverityBadge } from '@/components/registry/security/badges'
import { type Vulnerability } from '@/types/scan'

type Props = {
  vulnerabilities: Vulnerability[]
}

export function ScanTable({ vulnerabilities }: Props) {
  return (
    <div className="max-h-120 overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b text-muted-foreground">
          <tr>
            <th className="p-3" scope="col">
              Severity
            </th>
            <th className="p-3" scope="col">
              Vulnerability
            </th>
            <th className="p-3" scope="col">
              Package
            </th>
            <th className="p-3" scope="col">
              Installed
            </th>
            <th className="p-3" scope="col">
              Fixed
            </th>
            <th className="p-3" scope="col">
              Platform
            </th>
          </tr>
        </thead>

        <tbody className="divide-y">
          {vulnerabilities.map((entry, index) => (
            <tr key={`${entry.platform}/${entry.target}/${entry.id}/${index}`}>
              <td className="p-3">
                <SeverityBadge severity={entry.severity} />
              </td>
              <td className="p-3" title={entry.title}>
                {entry.id}
              </td>
              <td className="break-all p-3" title={entry.target}>
                {entry.package}
              </td>
              <td className="break-all p-3">{entry.installed}</td>
              <td className="break-all p-3">{entry.fixed || 'Not available'}</td>
              <td className="p-3">{entry.platform}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
