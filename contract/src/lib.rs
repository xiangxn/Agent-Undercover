use near_sdk::{near, AccountId, PanicOnDefault};

/// Agent Undercover escrow contract.
///
/// Day 1 skeleton: deployable and view-testable. Game methods land in Day 1/Day 2.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub game_master: AccountId,
    pub room_count: u64,
}

#[near]
impl Contract {
    #[init]
    pub fn new(game_master: AccountId) -> Self {
        Self {
            game_master,
            room_count: 0,
        }
    }

    pub fn get_game_master(&self) -> AccountId {
        self.game_master.clone()
    }

    pub fn get_room_count(&self) -> u64 {
        self.room_count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initializes() {
        let contract = Contract::new("gm.testnet".parse().unwrap());
        assert_eq!(contract.get_room_count(), 0);
        assert_eq!(contract.get_game_master().as_str(), "gm.testnet");
    }
}
