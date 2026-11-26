import * as Cloudflare from "@alchemy.run/cloudflare";
import { RuntimeContext } from "alchemy/RuntimeContext";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

/**
 * How one of the catalog's replies is kept: under what name, in what shape,
 * and for how long.
 *
 * For `freshFor` the reply is handed over as it is, and the catalog is not
 * asked. After that, and until `keptFor`, it is still handed over at once,
 * and the catalog is asked behind it, so the next visit has what it said.
 * Past `keptFor` the reply is too old to show: the catalog is asked, and the
 * visit waits for it.
 */
export type Keeping<Reply> = Readonly<{
  name: string;
  reply: Schema.Codec<Reply, unknown, never, never>;
  freshFor: Duration.Duration;
  keptFor: Duration.Duration;
}>;

/**
 * The catalog's replies that are the same for every listener, kept so that a
 * visit is answered without waiting for the catalog. A reply that could not
 * be kept, or read back, is only asked for again: nothing fails for it.
 */
export class KeptReplies extends Context.Service<
  KeptReplies,
  {
    /**
     * `ask`, answered from what is kept whenever that is young enough. Made
     * once for each reply, as the adapter is built: what it returns is asked
     * for on every visit.
     */
    readonly keep: <Reply, E, R>(
      keeping: Keeping<Reply>,
      ask: Effect.Effect<Reply, E, R>,
    ) => Effect.Effect<Effect.Effect<Reply, E, R>>;
  }
>()("Bafle/KeptReplies") {}

/**
 * Where replies are kept past the isolate's own memory, and how work is done
 * once a reply has gone. Reading and writing never fail: a store that cannot
 * be reached has nothing, and keeps nothing.
 */
export type ReplyStore = Readonly<{
  read: (name: string) => Effect.Effect<Option.Option<string>>;
  write: (name: string, text: string, keptFor: Duration.Duration) => Effect.Effect<void>;
  behind: <R>(work: Effect.Effect<void, never, R>) => Effect.Effect<void, never, R>;
}>;

/**
 * How long the catalog is left alone after it was asked behind a reply. It
 * covers the asking itself, so visits that arrive meanwhile do not each ask
 * again, and a catalog that failed to answer, which is not asked on every
 * visit that follows.
 */
export const ASKED_AGAIN_AFTER = Duration.minutes(1);

type Kept<Reply> = Readonly<{ keptAt: number; reply: Reply }>;

/** The replies kept in `store`, with the isolate's own memory in front of it. */
export const keptRepliesOver = (store: ReplyStore): KeptReplies["Service"] => ({
  keep: <Reply, E, R>(keeping: Keeping<Reply>, ask: Effect.Effect<Reply, E, R>) =>
    Effect.sync(() => {
      const written = Schema.fromJsonString(
        Schema.Struct({ keptAt: Schema.Number, reply: keeping.reply }),
      );
      const freshFor = Duration.toMillis(keeping.freshFor);
      const keptFor = Duration.toMillis(keeping.keptFor);
      const askedAgainAfter = Duration.toMillis(ASKED_AGAIN_AFTER);

      let mine: Kept<Reply> | undefined;
      let askedBehindAt: number | undefined;

      /** What the store has, when it can be read as a reply of this shape. */
      const theirs: Effect.Effect<Kept<Reply> | undefined> = store.read(keeping.name).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed(undefined),
            onSome: (text) =>
              Schema.decodeUnknownEffect(written)(text).pipe(
                // A reply kept by a release that shaped it otherwise is no
                // reply to this one: it is asked for again, and written over.
                Effect.catch((error) =>
                  Effect.logDebug(`The kept ${keeping.name} could not be read`, error).pipe(
                    Effect.as(undefined),
                  ),
                ),
              ),
          }),
        ),
      );

      const write = (kept: Kept<Reply>) =>
        Schema.encodeEffect(written)(kept).pipe(
          Effect.flatMap((text) => store.write(keeping.name, text, keeping.keptFor)),
          Effect.catch((error) => Effect.logWarning(`Could not keep ${keeping.name}`, error)),
        );

      /** The catalog's own answer, remembered here as it comes. */
      const asked = ask.pipe(
        Effect.flatMap((reply) =>
          Clock.currentTimeMillis.pipe(
            Effect.map((keptAt) => {
              mine = { keptAt, reply };
              return mine;
            }),
          ),
        ),
      );

      /**
       * The catalog asked once the reply has gone. Whatever it fails with,
       * what is kept goes on being shown, and it is asked again later.
       */
      const askedBehind = asked.pipe(
        Effect.flatMap(write),
        Effect.catch((error) =>
          Effect.logWarning(`Could not bring the kept ${keeping.name} up to date`, error),
        ),
      );

      return Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        if (mine !== undefined && now - mine.keptAt < freshFor) return mine.reply;

        // Nothing fresh in this isolate: another one may have asked since.
        const found = yield* theirs;
        if (found !== undefined && (mine === undefined || found.keptAt > mine.keptAt)) mine = found;
        if (mine !== undefined && now - mine.keptAt < freshFor) return mine.reply;

        if (mine !== undefined && now - mine.keptAt < keptFor) {
          if (askedBehindAt === undefined || now - askedBehindAt >= askedAgainAfter) {
            askedBehindAt = now;
            yield* store.behind(askedBehind);
          }
          return mine.reply;
        }

        const kept = yield* asked;
        // The visit has waited for the catalog already: not for the store too.
        yield* store.behind(write(kept));
        return kept.reply;
      });
    }),
});

/**
 * Replies kept in the memory of whoever builds this, with the work behind a
 * reply done before it is handed over: for a catalog read in tests, and
 * anywhere there is no request to outlive.
 */
export const KeptRepliesInMemory = Layer.sync(KeptReplies, () => {
  const texts = new Map<string, string>();
  return keptRepliesOver({
    read: (name) => Effect.sync(() => Option.fromNullishOr(texts.get(name))),
    write: (name, text) => Effect.sync(() => void texts.set(name, text)),
    behind: (work) => work,
  });
});

/** The name a reply is kept under, with the version of how it is written down. */
const keptAs = (name: string): string => `reply:1:${name}`;

/** The shortest time Workers KV keeps anything for. */
const KV_SHORTEST = Duration.seconds(60);

/**
 * Replies kept in Workers KV, where every isolate everywhere finds them: a
 * visit to a fresh isolate, or to one in another data centre, is answered
 * from what an earlier visit anywhere was told. KV lets go of a reply by
 * itself once it is too old to show.
 */
export const KeptRepliesKV = Layer.effect(
  KeptReplies,
  Effect.gen(function* () {
    const store = yield* Cloudflare.KV.ReadWriteNamespace(Cloudflare.KV.Namespace("KeptReplies"));

    // NOTE: as in `PicturePlaceholdersKV`: KV's client names the host's
    // RuntimeContext in its type, and reads the Worker's env, never the context.
    return keptRepliesOver({
      read: (name) =>
        store.get(keptAs(name), "text").pipe(
          Effect.map(Option.fromNullishOr),
          Effect.catch((error) =>
            Effect.logWarning(`Could not read the kept ${name}`, error).pipe(
              Effect.as(Option.none<string>()),
            ),
          ),
          Effect.provide(RuntimeContext.phantom),
        ),
      write: (name, text, keptFor) =>
        store
          .put(keptAs(name), text, {
            expirationTtl: Duration.toSeconds(Duration.max(keptFor, KV_SHORTEST)),
          })
          .pipe(
            Effect.catch((error) => Effect.logWarning(`Could not keep ${name}`, error)),
            Effect.provide(RuntimeContext.phantom),
          ),
      // Inside a request, after it: the reply goes now. Outside one there is
      // no request to outlive, and the work is done first.
      behind: (work) =>
        Effect.gen(function* () {
          const execution = yield* Cloudflare.WorkerExecutionContext;
          yield* execution === Cloudflare.deferredExecutionContext
            ? work
            : execution.waitUntil(work);
        }).pipe(Effect.provide(RuntimeContext.phantom)),
    });
  }),
);
