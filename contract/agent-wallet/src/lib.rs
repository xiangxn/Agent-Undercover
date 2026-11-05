use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
};
use near_sdk::json_types::U128;

/// Minimal wallet contract deployed on each persistent agent account.
///
/// The account has no full-access key. It has two scoped FunctionCall keys:
/// one for the game contract (descriptions/votes) and one for this wallet's
/// `stake` method. `stake` can only send the configured stake to the game
/// contract's `join_room`; there is no path to withdraw the balance.
///
/// A NEAR FunctionCall access key cannot attach a deposit. Routing the stake
/// through this contract is what lets an agent join a game with its own funds
/// while the operator still cannot withdraw those funds.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AgentWallet {
    game_contract: AccountId,
    stake: u128,
}

#[near]
impl AgentWallet {
    #[init]
    pub fn new(game_contract: AccountId, stake: U128) -> Self {
        require!(stake.0 > 0, "Stake must be positive");
        Self {
            game_contract,
            stake: stake.0,
        }
    }

    /// Called by the agent's own scoped key. Sends exactly `stake` to
    /// `join_room` on the game contract.
    pub fn stake(&self, room_id: String) -> Promise {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Only the agent account"
        );
        require!(
            env::attached_deposit().as_yoctonear() == 0,
            "Do not attach a deposit"
        );

        let args = near_sdk::serde_json::to_vec(
            &near_sdk::serde_json::json!({ "room_id": room_id }),
        )
        .unwrap_or_else(|_| env::panic_str("Invalid room id"));

        Promise::new(self.game_contract.clone()).function_call(
            "join_room".to_string(),
            args,
            NearToken::from_yoctonear(self.stake),
            Gas::from_tgas(60),
        )
    }

    pub fn get_game_contract(&self) -> AccountId {
        self.game_contract.clone()
    }

    pub fn get_stake(&self) -> String {
        self.stake.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const STAKE: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR

    fn context(predecessor: &str, deposit: u128) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("alpha.agents.agent-undercover.testnet".parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit));
        builder
    }

    #[test]
    fn new_stores_config() {
        testing_env!(context("alpha.agents.agent-undercover.testnet", 0).build());
        let wallet = AgentWallet::new(
            "game.agent-undercover.testnet".parse().unwrap(),
            U128(STAKE),
        );
        assert_eq!(wallet.get_stake(), STAKE.to_string());
        assert_eq!(
            wallet.get_game_contract().as_str(),
            "game.agent-undercover.testnet"
        );
    }

    #[test]
    #[should_panic(expected = "Stake must be positive")]
    fn new_rejects_zero_stake() {
        testing_env!(context("alpha.agents.agent-undercover.testnet", 0).build());
        AgentWallet::new(
            "game.agent-undercover.testnet".parse().unwrap(),
            U128(0),
        );
    }

    #[test]
    fn stake_creates_promise_from_self() {
        testing_env!(context("alpha.agents.agent-undercover.testnet", 0).build());
        let wallet = AgentWallet::new(
            "game.agent-undercover.testnet".parse().unwrap(),
            U128(STAKE),
        );
        let promise = wallet.stake("room-1".to_string());
        drop(promise);
    }

    #[test]
    #[should_panic(expected = "Only the agent account")]
    fn stake_rejects_other_callers() {
        testing_env!(context("mallory.testnet", 0).build());
        let wallet = AgentWallet::new(
            "game.agent-undercover.testnet".parse().unwrap(),
            U128(STAKE),
        );
        drop(wallet.stake("room-1".to_string()));
    }

    #[test]
    #[should_panic(expected = "Do not attach a deposit")]
    fn stake_rejects_deposit() {
        testing_env!(context("alpha.agents.agent-undercover.testnet", 1).build());
        let wallet = AgentWallet::new(
            "game.agent-undercover.testnet".parse().unwrap(),
            U128(STAKE),
        );
        drop(wallet.stake("room-1".to_string()));
    }
}
