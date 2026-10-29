"use client";
import { useState, type FormEvent } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Clock3,
  HeartHandshake,
  MapPin,
  Plus,
  Search,
  ShoppingBag,
} from "lucide-react";
import { useI18n } from "@/components/language-provider";
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  Notice,
  PageHeader,
} from "@/components/ui";
import {
  API_URL,
  api,
  errorMessage,
  patch,
  post,
  query,
  useApi,
} from "@/lib/api";
import { formValidationMessage } from "@/lib/validation";
import { useAccount } from "@/features/account/account";
import type { Location } from "@/types/api";

type Offer = {
  id: number;
  product_name: string;
  business_name: string;
  category: string;
  unit: string;
  available_quantity: number;
  quantity: number;
  original_price_kzt: number | null;
  discounted_price_kzt: number;
  description: string;
  pickup_start: string;
  pickup_deadline: string;
  expires_at: string | null;
  address: string;
  city: string;
  bulk_available: boolean;
  terms: "discounted" | "free" | "negotiated";
  photo_url: string | null;
  status: string;
};
type Order = {
  id: number;
  status: string;
  seller: boolean;
  kind: string;
  customer_name: string;
  total_kzt: number;
  beneficiaries: number | null;
  logistics: string;
  items: {
    id: number;
    product_name: string;
    quantity: number;
    pickup_deadline: string;
    location_name: string;
    terms?: string;
    price_agreed?: boolean;
  }[];
  events: { status: string; created_at: string }[];
};
const statusLabel: Record<string, string> = {
  pending: "Ожидает подтверждения",
  reserved: "Зарезервирован",
  collected: "Выдан",
  cancelled: "Отменён",
  active: "Активно",
  inactive: "Неактивно",
  expired: "Время истекло",
};
export default function Marketplace() {
  const { account } = useAccount();
  return <MarketplaceContent key={account?.user.id ?? "anonymous"} />;
}

function MarketplaceContent() {
  const { t, money, pickupTime } = useI18n();
  const { account, open } = useAccount();
  const [view, setView] = useState<"offers" | "orders" | "manage">("offers");
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [city, setCity] = useState(""),
    [price, setPrice] = useState(""),
    [discount, setDiscount] = useState(""),
    [charity, setCharity] = useState(false);
  const [agreedPrices, setAgreedPrices] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Offer | null>(null),
    [publish, setPublish] = useState(false),
    [editing, setEditing] = useState<Offer | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const offers = useApi<Offer[]>(
    view === "manage"
      ? "/market/my-listings"
      : "/market/listings" +
          query({
            search,
            category,
            city,
            max_price: price ? Number(price) : undefined,
            min_discount: discount ? Number(discount) : undefined,
            charity: charity ? "true" : undefined,
          }),
  );
  const orders = useApi<Order[]>(
    view === "orders" && account ? "/market/orders" : null,
  );
  const catalog = useApi<Offer[]>("/market/listings");
  function reload() {
    offers.reload();
    orders.reload();
    catalog.reload();
  }
  function protectedView(next: "orders" | "manage") {
    if (!account) {
      open();
      return;
    }
    setView(next);
    setError("");
  }
  async function action(id: number, kind: string) {
    setPending(true);
    setError("");
    try {
      await post(
        `/market/orders/${id}/${kind}`,
        kind === "approve" &&
          agreedPrices[id] !== undefined &&
          agreedPrices[id] !== ""
          ? { agreed_price_kzt: Number(agreedPrices[id]) }
          : {},
      );
      reload();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  async function toggle(offer: Offer) {
    setPending(true);
    setError("");
    try {
      await patch(`/market/listings/${offer.id}`, {
        status: offer.status === "active" ? "inactive" : "active",
      });
      reload();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="SAQTA SAVE"
        title={t("Хорошая еда. Новая возможность.")}
        description={t(
          "Выбирайте продукты поблизости и забирайте в удобное время.",
        )}
        action={
          <button
            className="btn-primary"
            onClick={() => {
              if (!account) {
                open();
                return;
              }
              setPublish(true);
            }}
          >
            <Plus size={17} />
            {t("Разместить продукты")}
          </button>
        }
      />
      <div className="flex flex-wrap justify-between gap-4 border-b border-[#dfe6db] pb-4">
        <div className="flex gap-2">
          {(
            [
              "offers",
              "orders",
              ...(account?.user.role === "business" ? ["manage"] : []),
            ] as const
          ).map((item) => (
            <button
              key={item}
              className={view === item ? "btn-primary" : "btn-secondary"}
              onClick={() =>
                item === "offers"
                  ? setView("offers")
                  : protectedView(item as "orders" | "manage")
              }
            >
              {t(
                item === "offers"
                  ? "Предложения"
                  : item === "orders"
                    ? "Мои заявки"
                    : "Мои предложения",
              )}
            </button>
          ))}
        </div>
        <button
          className={`flex items-center gap-2 text-sm ${charity ? "font-bold text-[#237a57]" : "muted"}`}
          aria-pressed={charity}
          onClick={() => {
            setCharity(!charity);
            setView("offers");
          }}
        >
          <HeartHandshake size={20} />
          {t("Для благотворительности")}
        </button>
      </div>
      {notice && <Notice kind="success">{t(notice)}</Notice>}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {view === "offers" && (
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label={t("Поиск")}>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-3.5 text-[#637369]"
              />
              <input
                className="field !pl-9"
                value={search}
                maxLength={120}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Название продукта")}
              />
            </div>
          </Field>
          <Field label={t("Категория")}>
            <select
              className="field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">{t("Все категории")}</option>
              {Array.from(new Set(catalog.data?.map((o) => o.category))).map(
                (value) => (
                  <option key={value}>{t(value)}</option>
                ),
              )}
            </select>
          </Field>
          <Field label={t("Город")}>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="field"
              maxLength={100}
              placeholder={t("Любой город")}
            />
          </Field>
          <Field label={t("Цена до, ₸")}>
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="field"
            />
          </Field>
          <Field label={t("Скидка от")}>
            <select
              className="field"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            >
              <option value="">{t("Любая")}</option>
              {[10, 25, 50, 75].map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </select>
          </Field>
          <button
            className="btn-secondary"
            onClick={() => {
              setSearch("");
              setCategory("");
              setCity("");
              setPrice("");
              setDiscount("");
              setCharity(false);
            }}
          >
            {t("Сбросить фильтры")}
          </button>
        </div>
      )}
      {view !== "orders" ? (
        offers.error ? (
          <ErrorState error={offers.error} retry={offers.reload} />
        ) : offers.loading ? (
          <Loading label={t("Загружаем предложения…")} />
        ) : offers.data?.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {offers.data.map((offer) => (
              <article
                key={offer.id}
                className="overflow-hidden rounded-3xl border border-[#dfe6db] bg-white"
              >
                <div className="relative flex h-44 items-center justify-center overflow-hidden bg-[#e9eee2]">
                  {offer.photo_url ? (
                    <Image
                      unoptimized
                      src={API_URL + offer.photo_url}
                      alt={offer.product_name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <ShoppingBag
                      size={48}
                      strokeWidth={1}
                      className="text-[#829879]"
                    />
                  )}
                  <span className="absolute left-4 top-4">
                    <Badge>
                      {view === "manage" && offer.status !== "active"
                        ? t(statusLabel[offer.status])
                        : offer.terms === "discounted" &&
                            offer.original_price_kzt !== null &&
                            offer.original_price_kzt >
                              offer.discounted_price_kzt
                          ? `−${Math.round((1 - offer.discounted_price_kzt / offer.original_price_kzt) * 100)}%`
                          : t(
                              offer.terms === "free"
                                ? "Бесплатно"
                                : offer.terms === "negotiated"
                                  ? "По согласованию"
                                  : "Доступно",
                            )}
                    </Badge>
                  </span>
                  {offer.bulk_available && (
                    <HeartHandshake
                      size={23}
                      className="absolute right-4 top-4 text-[#123c2f]"
                    />
                  )}
                </div>
                <div className="space-y-3 p-5">
                  <p className="text-xs text-[#637369]">
                    {offer.business_name} · {t(offer.category)}
                  </p>
                  <h2 className="text-lg font-semibold tracking-tight">
                    {offer.product_name}
                  </h2>
                  <p className="text-xs text-[#637369]">
                    {offer.available_quantity} {t(offer.unit)} ·{" "}
                    {t(
                      view === "manage"
                        ? statusLabel[offer.status]
                        : "В наличии",
                    )}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-[#637369]">
                    <MapPin size={14} />
                    {offer.city}, {offer.address}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-[#637369]">
                    <Clock3 size={14} />
                    {t("Забрать до")} {pickupTime(offer.pickup_deadline)}
                  </p>
                  <div className="flex items-end justify-between gap-3 pt-2">
                    <div>
                      {offer.terms !== "negotiated" &&
                        offer.original_price_kzt !== null &&
                        offer.original_price_kzt >
                          offer.discounted_price_kzt && (
                          <p className="text-xs text-[#637369] line-through">
                            {money(offer.original_price_kzt)}
                          </p>
                        )}
                      <p className="text-xl font-semibold text-[#123c2f]">
                        {t(
                          offer.terms === "free"
                            ? "Бесплатно"
                            : offer.terms === "negotiated"
                              ? "По согласованию"
                              : money(offer.discounted_price_kzt),
                        )}
                      </p>
                    </div>
                    <button
                      className="btn-primary !p-2.5"
                      aria-label={t("Открыть предложение")}
                      onClick={() => setSelected(offer)}
                    >
                      <ArrowUpRight size={20} />
                    </button>
                  </div>
                  {view === "manage" && (
                    <div className="flex gap-2 border-t border-[#e5e9e0] pt-3">
                      <button
                        className="text-xs underline"
                        onClick={() => setEditing(offer)}
                      >
                        {t("Изменить")}
                      </button>
                      {offer.status !== "expired" && (
                        <button
                          className="text-xs underline"
                          disabled={pending}
                          onClick={() => void toggle(offer)}
                        >
                          {t(
                            offer.status === "active"
                              ? "Снять с публикации"
                              : "Опубликовать",
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Card>
            <Empty
              title={t("Пока нет подходящих предложений")}
              description={t(
                "Попробуйте другие фильтры или разместите продукты своего бизнеса.",
              )}
            />
          </Card>
        )
      ) : orders.error ? (
        <ErrorState error={orders.error} retry={orders.reload} />
      ) : orders.loading ? (
        <Loading />
      ) : orders.data?.length ? (
        <div className="space-y-4">
          {orders.data.map((order) => (
            <Card key={order.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">
                  {t("Заявка")} #{order.id} · {order.customer_name}
                </h2>
                <Badge tone={order.status === "cancelled" ? "gray" : "green"}>
                  {t(statusLabel[order.status])}
                </Badge>
              </div>
              <div className="my-4 space-y-2">
                {order.items.map((item) => (
                  <p key={item.id} className="text-sm">
                    {item.product_name} × {item.quantity}
                    <span className="muted ml-2">
                      {item.location_name} · {pickupTime(item.pickup_deadline)}
                    </span>
                  </p>
                ))}
              </div>
              {order.kind === "bulk" && (
                <p className="mb-3 text-sm">
                  {t("Получателей")}: {order.beneficiaries ?? "—"} ·{" "}
                  {order.logistics}
                </p>
              )}
              {order.seller &&
                order.status === "pending" &&
                order.items.some((item) => item.terms === "negotiated") && (
                  <Field label={t("Согласованная цена за единицу, ₸")}>
                    <input
                      className="field"
                      type="number"
                      min={0}
                      max={10000000}
                      value={agreedPrices[order.id] ?? ""}
                      onChange={(event) =>
                        setAgreedPrices((current) => ({
                          ...current,
                          [order.id]: event.target.value,
                        }))
                      }
                    />
                  </Field>
                )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong>
                  {order.items.some(
                    (item) => item.terms === "negotiated" && !item.price_agreed,
                  )
                    ? t("По согласованию")
                    : money(order.total_kzt)}
                </strong>
                {["pending", "reserved"].includes(order.status) && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-secondary"
                      disabled={pending}
                      onClick={() => void action(order.id, "cancel")}
                    >
                      {t("Отменить")}
                    </button>
                    {order.seller && (
                      <button
                        className="btn-primary"
                        disabled={pending}
                        onClick={() =>
                          void action(
                            order.id,
                            order.status === "pending" ? "approve" : "collect",
                          )
                        }
                      >
                        {t(
                          order.status === "pending"
                            ? "Подтвердить заявку"
                            : "Подтвердить выдачу",
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <details className="mt-4 text-xs text-[#637369]">
                <summary>{t("История заявки")}</summary>
                {order.events.map((event, i) => (
                  <p key={i} className="mt-2">
                    {pickupTime(event.created_at)} ·{" "}
                    {t(statusLabel[event.status] || event.status)}
                  </p>
                ))}
              </details>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Empty
            title={t("Заявок пока нет")}
            description={t(
              "Выберите продукты на витрине, чтобы оформить первую заявку.",
            )}
          />
        </Card>
      )}
      {selected && (
        <Reservation
          offer={selected}
          close={() => setSelected(null)}
          done={() => {
            setSelected(null);
            setNotice(
              "Заявка сохранена. Статус доступен в разделе «Мои заявки».",
            );
            reload();
          }}
        />
      )}
      {publish && (
        <Modal
          title={t("Разместить продукты")}
          onClose={() => setPublish(false)}
        >
          {account?.user.role === "business" ? (
            <Publish
              close={() => {
                setPublish(false);
                setView("manage");
                reload();
              }}
            />
          ) : (
            <Notice>
              {t("Публикация доступна после подтверждения бизнес-аккаунта")}
            </Notice>
          )}
        </Modal>
      )}
      {editing && (
        <EditOffer
          offer={editing}
          close={() => setEditing(null)}
          done={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
function Reservation({
  offer,
  close,
  done,
}: {
  offer: Offer;
  close: () => void;
  done: () => void;
}) {
  const { t, money, pickupTime } = useI18n();
  const { account, open } = useAccount();
  const [bulk, setBulk] = useState(offer.terms === "negotiated"),
    [quantity, setQuantity] = useState(1),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = formValidationMessage(e.currentTarget);
    if (problem) {
      setError(problem);
      return;
    }
    if (!account) {
      open();
      return;
    }
    const data = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    try {
      await post("/market/orders", {
        listing_id: offer.id,
        quantity,
        customer_name: String(data.get("name")),
        kind: bulk ? "bulk" : "individual",
        beneficiaries:
          bulk && data.get("beneficiaries")
            ? Number(data.get("beneficiaries"))
            : null,
        logistics: bulk ? String(data.get("logistics") || "") : "",
        idempotency_key: requestKey,
      });
      done();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal title={offer.product_name} onClose={close}>
      <div className="space-y-4">
        <p className="muted text-sm">
          {offer.business_name} · {offer.address}
        </p>
        {offer.description && (
          <p className="text-sm leading-7">{offer.description}</p>
        )}
        <div className="rounded-xl bg-[#f0f4e9] p-4 text-sm">
          <p>
            {t("Самовывоз")}: {pickupTime(offer.pickup_start)} —{" "}
            {pickupTime(offer.pickup_deadline)}
          </p>
          {offer.expires_at && (
            <p className="mt-2">
              {t("Срок годности")}: {pickupTime(offer.expires_at)}
            </p>
          )}
        </div>
        <p className="text-xs muted">
          {t(
            "Оплата при получении, если она предусмотрена условиями. Онлайн-оплата не проводится.",
          )}
        </p>
        {account ? (
          <form
            noValidate
            onSubmit={(e) => void submit(e)}
            className="space-y-4"
          >
            <Field label={t("Имя получателя")}>
              <input
                name="name"
                className="field"
                required
                maxLength={100}
                defaultValue={account.organization.name}
              />
            </Field>
            <Field label={t("Количество")}>
              <input
                type="number"
                min={1}
                max={offer.available_quantity}
                required
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="field"
              />
            </Field>
            {offer.bulk_available && account.user.role === "charity" && (
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={bulk}
                  onChange={(e) => setBulk(e.target.checked)}
                />
                {t("Заявка от организации")}
              </label>
            )}
            {bulk && (
              <>
                <Field label={t("Примерное число получателей")}>
                  <input
                    type="number"
                    name="beneficiaries"
                    min={1}
                    max={1000000}
                    className="field"
                    required
                  />
                </Field>
                <Field label={t("Потребности в доставке и условия передачи")}>
                  <textarea
                    name="logistics"
                    maxLength={1000}
                    className="field"
                  />
                </Field>
                <Notice>
                  {t(
                    "Количество будет зарезервировано до решения продавца. Передачу нужно согласовать.",
                  )}
                </Notice>
              </>
            )}
            <button
              className="btn-primary w-full"
              disabled={
                pending ||
                offer.available_quantity < 1 ||
                offer.status !== "active" ||
                new Date(offer.pickup_deadline) <= new Date()
              }
            >
              {t(
                pending
                  ? "Сохраняем…"
                  : bulk
                    ? "Отправить заявку"
                    : "Забронировать",
              )}{" "}
              ·{" "}
              {offer.terms === "negotiated"
                ? t("По согласованию")
                : money(quantity * offer.discounted_price_kzt)}
            </button>
          </form>
        ) : (
          <button className="btn-primary w-full" onClick={open}>
            {t("Войдите, чтобы забронировать")}
          </button>
        )}
        {error && <Notice kind="error">{t(error)}</Notice>}
      </div>
    </Modal>
  );
}
function Publish({ close }: { close: () => void }) {
  const { t } = useI18n();
  const locations = useApi<Location[]>("/locations");
  const [terms, setTerms] = useState("discounted"),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [published, setPublished] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (published) return;
    const problem = formValidationMessage(e.currentTarget);
    if (problem) {
      setError(problem);
      return;
    }
    const data = new FormData(e.currentTarget);
    const str = (k: string) => String(data.get(k) || "");
    setPending(true);
    setError("");
    try {
      const result = await post<Offer>("/market/listings", {
        name: str("name"),
        category: str("category"),
        unit: str("unit"),
        quantity: Number(data.get("quantity")),
        original_price: str("original") ? Number(data.get("original")) : null,
        price: terms === "discounted" ? Number(data.get("price")) : 0,
        terms,
        description: str("description"),
        location_id: Number(data.get("location")),
        pickup_start: new Date(str("start")).toISOString(),
        pickup_deadline: new Date(str("end")).toISOString(),
        expires_at: new Date(str("expiry")).toISOString(),
        bulk_available: terms === "negotiated" || data.get("bulk") === "on",
        stock_confirmed: data.get("stock") === "on",
      });
      setPublished(true);
      const file = data.get("photo");
      if (file instanceof File && file.size) {
        const body = new FormData();
        body.set("file", file);
        try {
          await api(`/market/listings/${result.id}/photo`, {
            method: "POST",
            body,
          });
        } catch {
          setError(
            "Предложение опубликовано, но фото не загрузилось. Его можно добавить при редактировании.",
          );
          return;
        }
      }
      close();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ["name", "Название продукта"],
          ["category", "Категория"],
          ["unit", "Единица измерения"],
        ].map(([key, label]) => (
          <Field key={key} label={t(label)}>
            <input
              name={key}
              required
              maxLength={key === "unit" ? 20 : key === "category" ? 60 : 120}
              className="field"
              placeholder={
                key === "unit" ? t("Например: шт., кг, г") : undefined
              }
            />
          </Field>
        ))}
        <Field label={t("Фактически доступное количество")}>
          <input
            name="quantity"
            type="number"
            min={1}
            max={100000}
            required
            className="field"
          />
        </Field>
      </div>
      <Field label={t("Описание")}>
        <textarea name="description" maxLength={1000} className="field" />
      </Field>
      <Field label={t("Условия передачи")}>
        <select
          className="field"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
        >
          <option value="discounted">{t("Со скидкой")}</option>
          <option value="free">{t("Бесплатно")}</option>
          <option value="negotiated">{t("По согласованию")}</option>
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Обычная цена, ₸ · необязательно")}>
          <input
            type="number"
            name="original"
            min={0}
            max={10000000}
            className="field"
          />
        </Field>
        {terms === "discounted" && (
          <Field label={t("Цена предложения, ₸")}>
            <input
              type="number"
              name="price"
              min={0}
              max={10000000}
              required
              className="field"
            />
          </Field>
        )}
      </div>
      <Field label={t("Место получения")}>
        <select className="field" name="location" required defaultValue="">
          <option value="">{t("Выберите точку")}</option>
          {locations.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · {l.address}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ["start", "Начало выдачи"],
          ["end", "Конец выдачи"],
          ["expiry", "Срок годности"],
        ].map(([key, label]) => (
          <Field key={key} label={t(label)}>
            <input
              type="datetime-local"
              name={key}
              required
              className="field"
            />
          </Field>
        ))}
        <Field label={t("Фото продукта · до 2 МБ")}>
          <input
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            className="field"
          />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="bulk" />
        {t("Доступно для благотворительных организаций")}
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="stock" required />
        {t("Подтверждаю фактический запас и пригодность продуктов к передаче.")}
      </label>
      {error && <Notice kind="error">{t(error)}</Notice>}
      {published ? (
        <button type="button" className="btn-primary w-full" onClick={close}>
          {t("К моим предложениям")}
        </button>
      ) : (
        <button
          className="btn-primary w-full"
          disabled={pending || locations.loading}
        >
          {t(pending ? "Сохраняем…" : "Опубликовать")}
        </button>
      )}
    </form>
  );
}
function EditOffer({
  offer,
  close,
  done,
}: {
  offer: Offer;
  close: () => void;
  done: () => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const invalid = formValidationMessage(e.currentTarget);
    if (invalid) {
      setError(invalid);
      return;
    }
    const data = new FormData(e.currentTarget);
    setPending(true);
    try {
      await patch(`/market/listings/${offer.id}`, {
        description: String(data.get("description")),
        discounted_price_kzt: Number(data.get("price")),
        quantity: Number(data.get("quantity")),
        pickup_start: new Date(String(data.get("start"))).toISOString(),
        pickup_deadline: new Date(String(data.get("end"))).toISOString(),
      });
      const file = data.get("photo");
      if (file instanceof File && file.size) {
        const body = new FormData();
        body.set("file", file);
        await api(`/market/listings/${offer.id}/photo`, {
          method: "POST",
          body,
        });
      }
      done();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal title={t("Изменить предложение")} onClose={close}>
      <form noValidate onSubmit={(e) => void submit(e)} className="space-y-4">
        <Field label={t("Описание")}>
          <textarea
            name="description"
            defaultValue={offer.description}
            maxLength={1000}
            className="field"
          />
        </Field>
        <Field label={t("Цена предложения, ₸")}>
          <input
            type="number"
            name="price"
            required
            min={0}
            max={
              offer.terms === "discounted"
                ? (offer.original_price_kzt ?? 10000000)
                : 0
            }
            defaultValue={offer.discounted_price_kzt}
            className="field"
          />
        </Field>
        <Field label={t("Общее количество")}>
          <input
            type="number"
            name="quantity"
            min={1}
            max={offer.quantity}
            defaultValue={offer.quantity}
            required
            className="field"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["start", "Начало выдачи", offer.pickup_start],
            ["end", "Конец выдачи", offer.pickup_deadline],
          ].map(([key, label, value]) => (
            <Field key={key} label={t(label)}>
              <input
                name={key}
                type="datetime-local"
                defaultValue={new Date(
                  new Date(value).getTime() -
                    new Date(value).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)}
                required
                className="field"
              />
            </Field>
          ))}
        </div>
        <Field label={t("Фото продукта · до 2 МБ")}>
          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="field"
          />
        </Field>
        {error && <Notice kind="error">{t(error)}</Notice>}
        <button className="btn-primary" disabled={pending}>
          {t("Сохранить")}
        </button>
      </form>
    </Modal>
  );
}
