import { isTruthy } from "is-truthy-ts";
import type { MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Spacer } from "structure-kit";
import { baseToCommon } from "~/shared/convert";
import { truncateAddress } from "~/shared/truncateAddress";

const TOKEN_ADDRESS = "0x88129563b5cd13bd6f0e2dae364b35a5771cbc5e";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};
interface Token {
  circulating_market_cap: string;
  icon_url: string;
  name: string;
  decimals: string;
  symbol: string;
  address: string;
  type: string;
  holders: string;
  exchange_rate: string;
  total_supply: string;
}

function getTotalSupply(token: Token) {
  const { decimals, total_supply } = token;
  return baseToCommon(total_supply, Number(decimals)).toNumber();
}

function formatPercent(value: number) {
  const formatter =
    value < 0.01
      ? new Intl.NumberFormat("en", {
          style: "percent",
          maximumSignificantDigits: 1,
        })
      : new Intl.NumberFormat("en", { style: "percent" });
  return formatter.format(value);
}

interface ZerionIdentifier {
  address: string;
  nft: {
    chain: string;
    contractAddress: string;
    tokenId: string;
    metadata: {
      name: string;
      content: {
        type: string;
        audioUrl: string | null;
        imagePreviewUrl: string | null;
        imageUrl: string | null;
        videoUrl: string | null;
      };
    };
  };
  identities: { provider: "ens"; address: string; handle: string }[];
}
interface IndentifiersResponse {
  meta: null;
  data: ZerionIdentifier[];
  errors: null;
}

async function getWalletsMeta({ identifiers }: { identifiers: string[] }) {
  const url = new URL("https://zpi.zerion.io/wallet/get-meta/v1");
  url.searchParams.set("identifiers", identifiers.join(","));
  const x = await fetch(url.toString(), {
    headers: new Headers({
      "x-request-id": crypto.randomUUID(),
      "zerion-client-type": "web",
      "zerion-client-version": "1.0.0",
    }),
  });
  return (await x.json()) as IndentifiersResponse;
}

function splitIntoChunks<T>(arr: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function resolveEnsByChunks({ addresses }: { addresses: string[] }) {
  const chunks = splitIntoChunks(addresses, 10);
  const results = await Promise.all(
    chunks.map((chunk) => getWalletsMeta({ identifiers: chunk }))
  );
  return results
    .map((response) => response.data)
    .filter(isTruthy)
    .flat();
}

async function getHolders() {
  interface HoldersResponse {
    items: Array<{
      address: {
        hash: string;
        implementation_name: "implementationName";
        name: string;
        is_contract: boolean;
        is_verified: boolean;
      };
      value: string;
      token_id: string;
      token: Token;
    }>;
    next_page_params: { items_count: number; value: number };
  }
  const url = `https://zero-network.calderaexplorer.xyz/api/v2/tokens/${TOKEN_ADDRESS}/holders`;
  const response = await fetch(url);
  const result = (await response.json()) as HoldersResponse;
  return result;
}

async function getTokenCounters() {
  interface TokenCountersResponse {
    token_holders_count: string;
    transfers_count: string;
  }
  const url = `https://zero-network.calderaexplorer.xyz/api/v2/tokens/${TOKEN_ADDRESS}/counters`;
  const response = await fetch(url);
  const result = (await response.json()) as TokenCountersResponse;
  return result;
}

export const loader = async () => {
  const [holders, counters] = await Promise.all([
    getHolders(),
    getTokenCounters(),
  ]);
  const ZERO_TOKEN = holders.items[0].token;
  const totalSupply = getTotalSupply(ZERO_TOKEN);
  const addresses = holders.items.map((item) => item.address.hash);
  const identities = await resolveEnsByChunks({ addresses });
  const handles = new Map<string, string>();
  for (const x of identities) {
    if (x.identities[0]?.handle) {
      handles.set(x.address, x.identities[0].handle);
    }
  }
  return {
    // result: holders,
    holders: holders.items.map((item) => ({
      address: item.address.hash,
      handle: handles.get(item.address.hash),
      valueConverted: baseToCommon(
        item.value,
        Number(item.token.decimals)
      ).toNumber(),
      allocation:
        Number(BigInt(item.value)) / Number(BigInt(item.token.total_supply)),
    })),
    totalSupply,
    token: ZERO_TOKEN,
    counters,
  };
};

function Layout(props: React.PropsWithChildren) {
  return (
    <>
      <div
        style={{ maxWidth: 600, marginInline: "auto", paddingInline: 14 }}
        {...props}
      />
      <Spacer height={80} />
    </>
  );
}

function StatCell({
  name,
  value,
}: {
  name: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ color: "var(--gray-5)" }}>{name}</div>
      <div className="text-lg">{value}</div>
    </div>
  );
}

function TokenStats({
  token,
  totalSupply,
  transfersCount,
}: {
  token: Token;
  totalSupply: number;
  transfersCount: number;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
      <StatCell name="Holders" value={token.holders} />
      <StatCell
        name="Total Supply"
        value={new Intl.NumberFormat("en", { notation: "compact" }).format(
          totalSupply
        )}
      />
      <StatCell name="Transfers" value={transfersCount} />
    </div>
  );
}

export default function Index() {
  const { holders, token, totalSupply, counters } =
    useLoaderData<typeof loader>();
  return (
    <Layout>
      <Spacer height={40} />
      <h1 className="text-6xl">0</h1>
      <Spacer height={40} />
      <TokenStats
        token={token}
        totalSupply={totalSupply}
        transfersCount={Number(counters.transfers_count)}
      />
      <Spacer height={60} />
      <h2 className="text-2xl font-bold">Leaderboard</h2>
      <Spacer height={40} />
      <div
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "minmax(max-content, auto) auto auto",
          gap: 10,
        }}
      >
        <div style={{ display: "contents", color: "var(--gray-6)" }}>
          <span>Address</span>
          <span>Volume</span>
          <span>
            <span className="hidden sm:inline">Allocation</span>
            <span className="sm:hidden">Allc.</span>
          </span>
        </div>
        {holders.map((holder, index) => (
          <div key={holder.address} style={{ display: "contents" }}>
            <span>
              <span
                style={{
                  userSelect: "none",
                  width: 50,
                  marginLeft: "calc(0px - 50px - 0.5em)",
                  marginRight: "0.5em",
                  textAlign: "right",
                }}
                className="hidden sm:inline-block text-gray-500"
              >
                {index + 1}
              </span>
              <a
                className="underline hover:no-underline visited:text-gray-500"
                href={`https://app.zerion.io/${holder.address}/overview`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ overflowWrap: "break-word" }}
              >
                {holder.handle || truncateAddress(holder.address)}
              </a>
            </span>
            <span>
              {new Intl.NumberFormat("en", { notation: "compact" }).format(
                holder.valueConverted
              )}
            </span>
            <span>{formatPercent(holder.allocation)}</span>
          </div>
        ))}
      </div>
    </Layout>
  );
}
