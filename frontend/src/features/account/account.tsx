"use client";
import {
  createContext,
  useContext,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api, post, setSessionToken, useApi, errorMessage } from "@/lib/api";
import { formValidationMessage } from "@/lib/validation";
import { useI18n } from "@/components/language-provider";
import { Field, Modal, Notice } from "@/components/ui";
import { LogIn, LogOut, UserRound } from "lucide-react";
export type Account = {
  user: {
    id: number;
    email: string;
    role: "consumer" | "business" | "charity";
    requested_role: string;
  };
  organization: { id: number; name: string };
};
const Context = createContext<{
  account: Account | null;
  loading: boolean;
  open: () => void;
  reload: () => void;
}>({ account: null, loading: true, open: () => {}, reload: () => {} });
export const useAccount = () => useContext(Context);
export function AccountProvider({ children }: { children: ReactNode }) {
  const account = useApi<Account>("/auth/me");
  const [opened, setOpened] = useState(false);
  return (
    <Context
      value={{
        account: account.data,
        loading: account.loading,
        open: () => setOpened(true),
        reload: account.reload,
      }}
    >
      {children}
      {opened && <AccountModal close={() => setOpened(false)} />}
    </Context>
  );
}
export function AccountButton() {
  const { account, open } = useAccount();
  const { t } = useI18n();
  return (
    <button
      onClick={open}
      className="btn-secondary !rounded-full !px-3 !text-xs"
      aria-label={t(account ? "Мой аккаунт" : "Войти")}
    >
      <UserRound size={16} />
      <span className="hidden sm:inline">
        {t(account ? "Мой аккаунт" : "Войти")}
      </span>
    </button>
  );
}
function AccountModal({ close }: { close: () => void }) {
  const { account } = useAccount();
  const { t } = useI18n();
  const [register, setRegister] = useState(false),
    [role, setRole] = useState("consumer"),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const problem = formValidationMessage(event.currentTarget);
    if (problem) {
      setError(problem);
      return;
    }
    const data = new FormData(event.currentTarget);
    const get = (name: string) => String(data.get(name) || "").trim();
    setPending(true);
    try {
      const result = await post<{ token: string }>(
        register ? "/auth/register" : "/auth/login",
        {
          email: get("email"),
          password: String(data.get("password") || ""),
          ...(register
            ? {
                bakery_name: get("name"),
                address: get("address") || "Не указано",
                city: get("city") || "Не указано",
                location_name: get("location") || "Основная точка",
                requested_role: role,
              }
            : {}),
        },
      );
      setSessionToken(result.token);
      close();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  async function logout() {
    setPending(true);
    try {
      await api("/auth/logout", { method: "POST" });
      setSessionToken(null);
      close();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={t(
        account
          ? "Мой аккаунт"
          : register
            ? "Создать аккаунт"
            : "С возвращением",
      )}
      onClose={close}
    >
      {account ? (
        <div className="space-y-4">
          <p className="text-xl font-semibold">{account.organization.name}</p>
          <p>{account.user.email}</p>
          <Notice>
            {t(
              account.user.role === "business"
                ? "Подтверждённый бизнес"
                : account.user.role === "charity"
                  ? "Подтверждённая организация"
                  : "Покупатель",
            )}
            {account.user.requested_role !== account.user.role && (
              <p className="mt-2">
                {t(
                  "Заявка на подтверждение роли отправлена. Пока можно просматривать предложения и работать со своими данными.",
                )}
              </p>
            )}
          </Notice>
          <button
            className="btn-secondary"
            disabled={pending}
            onClick={() => void logout()}
          >
            <LogOut size={16} />
            {t("Выйти")}
          </button>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          className="space-y-4"
        >
          <Field label="Email">
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              className="field"
            />
          </Field>
          <Field label={t("Пароль")} hint={t("Не менее 10 символов")}>
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={10}
              maxLength={128}
              required
              className="field"
            />
          </Field>
          {register && (
            <>
              <Field label={t("Имя или название организации")}>
                <input
                  name="name"
                  className="field"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </Field>
              <Field label={t("Как вы будете пользоваться SAQTA?")}>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="field"
                >
                  <option value="consumer">{t("Покупатель")}</option>
                  <option value="business">{t("Бизнес")}</option>
                  <option value="charity">
                    {t("Благотворительная организация")}
                  </option>
                </select>
              </Field>
              {role !== "consumer" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("Город")}>
                      <input
                        name="city"
                        required
                        className="field"
                        minLength={2}
                        maxLength={100}
                      />
                    </Field>
                    <Field label={t("Название точки")}>
                      <input
                        name="location"
                        required
                        className="field"
                        minLength={2}
                        maxLength={120}
                      />
                    </Field>
                  </div>
                  <Field label={t("Адрес")}>
                    <input
                      name="address"
                      required
                      className="field"
                      minLength={3}
                      maxLength={250}
                    />
                  </Field>
                  <Notice>
                    {t(
                      "Публикация и благотворительные заявки станут доступны после проверки организации оператором. Анализ своих данных доступен сразу.",
                    )}
                  </Notice>
                </>
              )}
            </>
          )}
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={pending}
          >
            <LogIn size={16} />
            {t(pending ? "Сохраняем…" : register ? "Создать аккаунт" : "Войти")}
          </button>
          <button
            type="button"
            className="w-full text-sm underline underline-offset-4"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {t(register ? "Уже есть аккаунт" : "Создать аккаунт")}
          </button>
        </form>
      )}
      {error && (
        <div className="mt-4">
          <Notice kind="error">{t(error)}</Notice>
        </div>
      )}
    </Modal>
  );
}
